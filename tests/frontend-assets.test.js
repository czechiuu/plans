import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { exercises } from '../shared/exercises.js'

test('每个动作都有独立的本地原创循环示意和原实拍来源', async () => {
  assert.equal(exercises.length, 11)
  for (const exercise of exercises) {
    assert.equal(exercise.demo.localAsset, `media/exercises/${exercise.id}.svg`)
    assert.match(exercise.demo.localLicense, /原创.*CC0/)
    const svg = await readFile(new URL(`../public/${exercise.demo.localAsset}`, import.meta.url), 'utf8')
    assert.match(svg, /<title id="title">[^<]+动作循环示意<\/title>/)
    assert.match(svg, /class="person a"/)
    assert.match(svg, /class="person b"/)
    assert.match(svg, /prefers-reduced-motion/)
    assert.ok(exercise.demo.source?.startsWith('https://'))
  }
})
