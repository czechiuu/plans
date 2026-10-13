// GoTrue's documented user update endpoint, called with the initiating JWT.
export async function updatePasswordWithToken(fetcher, baseUrl, publishableKey, token, currentPassword, newPassword) {
  const response = await fetcher(`${baseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, password: newPassword }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const code = typeof body?.code === 'string' ? body.code : 'PASSWORD_UPDATE_FAILED'
    throw Object.assign(new Error(code), { code })
  }
  if (!body?.id) throw Object.assign(new Error('PASSWORD_UPDATE_FAILED'), { code: 'PASSWORD_UPDATE_FAILED' })
  return body.id
}
