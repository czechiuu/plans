import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cp, mkdir, mkdtemp, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

async function command(exe, args, cwd) {
  const output = []
  const child = spawn(exe, args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, LANG: 'C', LC_ALL: 'C', LC_MESSAGES: 'C' }
  })
  child.stdout?.on('data', chunk => output.push(chunk.toString()))
  child.stderr?.on('data', chunk => output.push(chunk.toString()))
  const code = await new Promise((accept, reject) => {
    child.once('error', reject)
    child.once('exit', accept)
  })
  if (code !== 0) throw new Error(`${exe.endsWith('initdb.exe') ? 'initdb' : 'pg_ctl'} failed (${code}): ${output.join('').slice(-1000)}`)
}

async function createLocalDatabase(port, adminPassword, name) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ host: '127.0.0.1', port, user: 'test_admin', password: adminPassword, database: 'postgres' })
  await client.connect()
  try { await client.query(`create database ${client.escapeIdentifier(name)}`) }
  finally { await client.end() }
}

export async function localPostgres(port) {
  if (process.platform !== 'win32' && process.platform !== 'linux') throw new Error('Isolated PostgreSQL fixture supports Windows and Linux')
  const clusterRoot = await mkdtemp(join(resolve(tmpdir()), 'pair-health-pg-'))
  const adminPassword = randomBytes(32).toString('hex')
  const authPassword = randomBytes(32).toString('hex')
  if (process.platform === 'linux') {
    const { default: EmbeddedPostgres } = await import('embedded-postgres')
    const server = new EmbeddedPostgres({
      databaseDir: join(clusterRoot, 'data'), user: 'test_admin', password: adminPassword, port,
      persistent: true, initdbFlags: ['--locale=C', '--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => {}, onError: () => {}
    })
    await server.initialise()
    await server.start()
    return { port, adminPassword, authPassword, clusterRoot,
      createDatabase: name => createLocalDatabase(port, adminPassword, name), stop: () => server.stop() }
  }
  const sourcePackage = dirname(dirname(fileURLToPath(import.meta.resolve('embedded-postgres'))))
  const sourceNative = join(dirname(sourcePackage), '@embedded-postgres', 'windows-x64', 'native')
  const native = join(resolve(tmpdir()), 'pair-health-postgres-native-cache-17.10.0-beta.17')
  const marker = join(native, 'copy-complete')
  if (!(await stat(marker).catch(() => null))) {
    await cp(sourceNative, native, { recursive: true })
    await writeFile(marker, 'local installed binaries only\n')
  }
  const dataDir = join(clusterRoot, 'data')
  await mkdir(dataDir)
  const passwordFile = join(clusterRoot, 'init-password')
  await writeFile(passwordFile, adminPassword + '\n')
  const bin = name => join(native, 'bin', `${name}.exe`)
  try {
    await command(bin('initdb'), [
      `--pgdata=${dataDir}`, '--auth=scram-sha-256', '--username=test_admin',
      `--pwfile=${passwordFile}`, '--locale=C', '--encoding=UTF8', '--lc-messages=C'
    ], clusterRoot)
  } finally { await unlink(passwordFile).catch(() => {}) }
  const logFile = join(clusterRoot, 'postgres.log')
  await command(bin('pg_ctl'), ['start', '-D', dataDir, '-w', '-l', logFile, '-o', `-h 127.0.0.1 -p ${port}`], clusterRoot)
  return {
    port, adminPassword, authPassword, clusterRoot,
    createDatabase: name => createLocalDatabase(port, adminPassword, name),
    stop: () => command(bin('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast', '-w'], clusterRoot)
  }
}
