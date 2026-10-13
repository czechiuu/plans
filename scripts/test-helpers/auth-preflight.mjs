function safeCode(error) {
  return /^[a-z_]{1,60}$/u.test(error?.code || '') ? error.code : 'unknown'
}

async function withinNetworkDeadline(operation, timeoutMs) {
  let timer
  try {
    return await Promise.race([
      operation(),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('联网核对超时'),{code:'network_timeout'})),timeoutMs)})
    ])
  } finally { clearTimeout(timer) }
}

export async function readVerifiedPassword({ slot, email, auth, readHidden, write, networkTimeoutMs=15000 }) {
  for (let attempt=1;attempt<=3;attempt++) {
    let password=await readHidden(`请输入「${slot}」的密码（不显示输入）：`)
    if (!password) {
      write(`${slot}密码不能为空。\n`)
      continue
    }
    let result
    write(`正在联网核对${slot}账号…\n`)
    try { result=await withinNetworkDeadline(()=>auth.signInWithPassword({ email, password }),networkTimeoutMs) }
    catch (error) { password=null; throw new Error(`认证预检失败（${safeCode(error)}）`) }
    if (result.error) {
      password=null
      if (result.error.code!=='invalid_credentials')
        throw new Error(`认证预检失败（${safeCode(result.error)}）`)
      if (attempt<3) write(`${slot}密码不正确，请重试。\n`)
      continue
    }
    if (result.data?.user?.email?.toLowerCase()!==email) {
      password=null
      throw new Error('认证账号与固定身份不符')
    }
    let signedOut
    try { signedOut=await withinNetworkDeadline(()=>auth.signOut({ scope:'local' }),networkTimeoutMs) }
    catch (error) { password=null; throw new Error(`本地会话清理失败（${safeCode(error)}）`) }
    if (signedOut.error) { password=null; throw new Error(`本地会话清理失败（${safeCode(signedOut.error)}）`) }
    return password
  }
  throw new Error(`${slot}密码连续三次不正确，云测未启动`)
}
