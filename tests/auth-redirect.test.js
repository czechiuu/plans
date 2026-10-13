import test from 'node:test'
import assert from 'node:assert/strict'
import { authRedirectUrl } from '../src/auth-redirect.js'

for (const [page, expected] of [
  ['http://localhost:5173/', 'http://localhost:5173/'],
  ['https://example.test/', 'https://example.test/'],
  ['https://example.test/plans/', 'https://example.test/plans/'],
  ['https://example.test/plans/index.html', 'https://example.test/plans/index.html'],
  ['https://example.test/plans/index.html?source=synthetic#access_token=synthetic', 'https://example.test/plans/index.html'],
  ['https://example.test/plans/?code=synthetic#type=recovery', 'https://example.test/plans/'],
]) {
  test(`邮件回跳保留部署页路径：${page}`, () => {
    assert.equal(authRedirectUrl(page), expected)
  })
}

test('拒绝非网页地址或带凭据的地址', () => {
  assert.throws(() => authRedirectUrl('javascript:alert(1)'))
  assert.throws(() => authRedirectUrl('https://user:secret@example.test/plans/'))
})
