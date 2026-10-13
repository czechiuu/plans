import test from 'node:test'
import assert from 'node:assert/strict'
import { resetFixedPassword } from '../scripts/reset-fixed-password.mjs'

const rows = [
  { slot: 'me', user_id: 'me-id', space_id: 'space-id' },
  { slot: 'w', user_id: 'w-id', space_id: 'space-id' }
]
const users = [
  { id: 'me-id', email: 'me@plans.invalid' },
  { id: 'w-id', email: 'w@plans.invalid' }
]

function clientFor(registry = rows, authUsers = users) {
  const updates = []
  return {
    from(table) {
      assert.equal(table, 'fixed_accounts')
      return { select: async columns => {
        assert.equal(columns, 'slot,user_id,space_id')
        return { data: registry, error: null }
      } }
    },
    auth: { admin: {
      listUsers: async options => {
        assert.deepEqual(options, { page: 1, perPage: 3 })
        return { data: { users: authUsers }, error: null }
      },
      updateUserById: async (id, attributes) => {
        updates.push({ id, attributes })
        return { data: { user: authUsers.find(user => user.id === id) }, error: null }
      }
    } },
    updates
  }
}

test('reset updates only the selected existing fixed user password', async () => {
  const client = clientFor()
  await resetFixedPassword(client, 'w', 'synthetic-password')
  assert.deepEqual(client.updates, [{ id: 'w-id', attributes: { password: 'synthetic-password' } }])
})

test('reset refuses extra Auth users before making a change', async () => {
  const client = clientFor(rows, [...users, { id: 'third-id', email: 'third@example.invalid' }])
  await assert.rejects(resetFixedPassword(client, 'me', 'synthetic-password'), { code: 'AUTH_MISMATCH' })
  assert.equal(client.updates.length, 0)
})

test('reset refuses a mismatched fixed-account registry before making a change', async () => {
  const client = clientFor([{ ...rows[0], space_id: 'other-space' }, rows[1]])
  await assert.rejects(resetFixedPassword(client, 'me', 'synthetic-password'), { code: 'REGISTRY_MISMATCH' })
  assert.equal(client.updates.length, 0)
})
