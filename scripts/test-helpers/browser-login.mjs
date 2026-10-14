export async function login(page,slot,password) {
  await page.locator('[data-form="signin"] button:not([disabled])').waitFor()
  await page.locator(`[data-form="signin"] [name="slot"][value="${slot}"]`).check()
  await page.getByLabel('密码',{exact:true}).fill(password)
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await page.getByRole('navigation',{name:'主导航'}).waitFor()
}
