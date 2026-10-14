import { mkdir, rm, writeFile } from 'node:fs/promises'

const root = new URL('../../test-results/', import.meta.url)

export async function report(name, scope, cases, privateDetails = []) {
  const counts = { passed: 0, failed: 0, blocked: 0, notrun: 0 }
  if (!cases.length) throw new Error('Verification did not run any cases')
  for (const item of cases) {
    if (!Object.hasOwn(counts,item.status)) throw new Error('Unknown verification status')
    counts[item.status]++
  }
  await mkdir(root, { recursive: true })
  // Public reports contain stable case IDs and statuses only.
  await writeFile(new URL(`${name}-results.json`, root), JSON.stringify({ generated_at: new Date().toISOString(), scope, ...counts, cases }, null, 2) + '\n')
  if (privateDetails.length) {
    const privateRoot = new URL('private/', root)
    await mkdir(privateRoot, { recursive: true })
    const safeDetails = privateDetails.map(item => ({ id: item.id, kind: item.error?.name || 'Error', ...(item.error?.code ? { code: item.error.code } : {}) }))
    await writeFile(new URL(`${name}-details.json`, privateRoot), JSON.stringify(safeDetails, null, 2) + '\n')
  } else await rm(new URL(`private/${name}-details.json`, root), { force:true })
  process.stdout.write(JSON.stringify({ scope, ...counts }) + '\n')
  if (counts.failed || counts.blocked || counts.notrun) process.exitCode = 1
}

export function blocked(ids) { return ids.map(id => ({ id, status: 'blocked' })) }
export function notrun(ids) { return ids.map(id => ({ id, status: 'notrun' })) }

export async function runCase(cases, details, id, fn) {
  try { await fn(); cases.push({ id, status: 'passed' }) }
  catch (error) {
    cases.push({ id, status: 'failed' })
    details.push({ id, error })
    throw error
  }
}
