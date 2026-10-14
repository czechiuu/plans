import test from 'node:test';
import assert from 'node:assert/strict';
import { exercises } from '../shared/exercises.js';

test('动作目录只声明 GIF 或原视频，不将旧 SVG 当完整教学', () => {
  assert.equal(exercises.length, 11);
  assert.equal(exercises.filter(({ demo }) => demo.mediaType === 'external_gif').length, 3);
  assert.equal(exercises.filter(({ demo }) => demo.mediaType === 'source_video').length, 8);
  for (const { id, demo } of exercises) {
    assert.equal(demo.localAsset, undefined, `${id}: 不应继续使用旧双帧 SVG`);
    assert.equal(demo.localLicense, undefined, `${id}: 不应标记外部 GIF 为原创 CC0`);
    if (demo.mediaType === 'external_gif') {
      assert.match(demo.gifUrl, /^https:\/\/static\.exercisedb\.dev\/media\/[A-Za-z0-9]+\.gif$/, id);
    } else {
      assert.equal(demo.gifUrl, undefined, `${id}: 原视频入口不应伪装为 GIF`);
    }
  }
});
