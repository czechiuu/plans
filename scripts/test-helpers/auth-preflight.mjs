function safeCode(error) {
  return /^[a-z_]{1,60}$/u.test(error?.code || '') ? error.code : 'unknown'
}

export async function readVerifiedPassword({ slot, email, auth, readHidden, write }) {
  for (let attempt=1;attempt<=3;attempt++) {
    let password=await readHidden(`请输入「${slot}」的密码（不显示输入）：`)
    if (!password) {
      write(`${slot}密码不能为空。\n`)
      continue
    }
    let result
    try { result=await auth.signInWithPassword({ email, password }) }
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
    try { signedOut=await auth.signOut({ scope:'local' }) }
    catch (error) { password=null; throw new Error(`本地会话清理失败（${safeCode(error)}）`) }
    if (signedOut.error) { password=null; throw new Error(`本地会话清理失败（${safeCode(signedOut.error)}）`) }
    return password
  }
  throw new Error(`${slot}密码连续三次不正确，云测未启动`)
}
