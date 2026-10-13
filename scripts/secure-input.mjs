import readline from 'node:readline'

let initialized = false

function cancelled() {
  return Object.assign(new Error('Input cancelled'), { code: 'INPUT_CANCELLED' })
}

function input(prompt, hidden) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function')
    throw new Error('Interactive TTY required')
  if (!initialized) { readline.emitKeypressEvents(process.stdin); initialized = true }
  const stdin = process.stdin, stdout = process.stdout
  const wasRaw = Boolean(stdin.isRaw)
  let value = ''
  stdout.write(prompt)
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      stdin.off('keypress', onKeypress)
      process.off('SIGINT', onSigint)
      stdin.setRawMode(wasRaw)
      if (!wasRaw) stdin.pause()
      stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onSigint = () => finish(cancelled())
    const onKeypress = (text, key) => {
      if (key?.ctrl && key.name === 'c') return finish(cancelled())
      if (key?.name === 'return' || key?.name === 'enter') return finish()
      if (key?.name === 'backspace' || key?.name === 'delete') {
        if (value) {
          value = [...value].slice(0,-1).join('')
          if (!hidden) stdout.write('\b \b')
        }
        return
      }
      if (!text || /[\u0000-\u001f\u007f]/u.test(text)) return
      if (value.length + text.length > 4096) return finish(new Error('Input too long'))
      value += text
      if (!hidden) stdout.write(text)
    }
    stdin.on('keypress', onKeypress)
    process.on('SIGINT', onSigint)
    stdin.setRawMode(true)
    stdin.ref()
    stdin.resume()
  })
}

export const readHidden = prompt => input(prompt, true)
export const readLine = prompt => input(prompt, false)

export function protectTerminal() {
  const stdin=process.stdin, wasRaw=Boolean(stdin.isRaw)
  let cancelled=false, restored=false
  const restore=()=>{
    if (restored) return
    restored=true
    stdin.off('data',onData)
    stdin.setRawMode(wasRaw)
    stdin.pause()
    stdin.unref()
  }
  const cancel=()=>{
    if (cancelled) return
    cancelled=true
    restore()
    process.stdout.write('\n取消已记录，等待当前操作安全结束。\n')
  }
  const onData=chunk=>{ if (chunk.includes(3)) cancel() }
  stdin.setRawMode(true)
  stdin.on('data',onData)
  process.on('SIGINT',cancel)
  stdin.resume()
  return {
    check() { if (cancelled) throw new Error('Input cancelled') },
    restore() { restore(); process.off('SIGINT',cancel) }
  }
}
