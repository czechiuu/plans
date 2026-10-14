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
    assert.match(svg, /aria-labelledby="title desc"/)
    assert.match(svg, /<title id="title">\s*[^<\s][^<]*<\/title>/)
    assert.match(svg, /<desc id="desc">\s*[^<\s][^<]*<\/desc>/)
    const classes=[...svg.matchAll(/class="([^"]+)"/g)].map(match=>match[1].split(/\s+/))
    assert.ok(classes.some(tokens=>tokens.includes('a')))
    assert.ok(classes.some(tokens=>tokens.includes('b')))
    assert.match(svg, /animation:[^;}]*infinite/)
    assert.match(svg, /@media\(prefers-reduced-motion:reduce\)\{\.a,\.b\{animation:none\}/)
    assert.ok(exercise.demo.source?.startsWith('https://'))
  }
})
