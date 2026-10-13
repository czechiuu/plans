export const emails = Object.freeze({ me: 'me@plans.invalid', w: 'w@plans.invalid' })

const failure = code => Object.assign(new Error(code), { code })

export async function verifiedUser(client, expectedSlot = null) {
  const start = await client.auth.getSession()
  if (start.error || !start.data?.session) throw failure('ACCOUNT_CHECK_FAILED')
  const token = start.data.session.access_token
  const stillCurrent = async () => {
    const current = await client.auth.getSession()
    return !current.error && current.data?.session?.access_token === token
  }
  const rejectCurrent = async code => {
    if (!await stillCurrent()) throw failure('ACCOUNT_CHANGED')
    await client.auth.signOut({ scope: 'local' })
    throw failure(code)
  }

  let user
  try {
    const response = await client.auth.getUser()
    if (response.error || !response.data?.user) return rejectCurrent('ACCOUNT_CHECK_FAILED')
    user = response.data.user
  } catch {
    return rejectCurrent('ACCOUNT_CHECK_FAILED')
  }
  if (!await stillCurrent()) throw failure('ACCOUNT_CHANGED')
  if (user.id !== start.data.session.user.id) return rejectCurrent('ACCOUNT_DENIED')

  let account
  try {
    const response = await client.rpc('current_account')
    if (response.error) return rejectCurrent('ACCOUNT_CHECK_FAILED')
    account = response.data
  } catch {
    return rejectCurrent('ACCOUNT_CHECK_FAILED')
  }
  if (!await stillCurrent()) throw failure('ACCOUNT_CHANGED')
  if (!emails[account] || user.email !== emails[account] || (expectedSlot && account !== expectedSlot)) return rejectCurrent('ACCOUNT_DENIED')
  return { user, account }
}
