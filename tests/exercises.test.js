import test from 'node:test';
import assert from 'node:assert/strict';
import { exercises, exerciseById } from '../shared/exercises.js';

const expectedIds = [
  'machine_leg_press', 'machine_seated_row', 'machine_chest_press',
  'machine_seated_leg_curl', 'machine_lat_pulldown', 'machine_hip_abduction',
  'machine_ab_crunch', 'dorm_supported_dumbbell_row',
  'dorm_dumbbell_floor_press', 'dorm_sit_to_stand', 'dorm_dead_bug',
];
const gifs = new Map([
  ['machine_seated_row', '7I6LNUG'],
  ['machine_chest_press', 'DOoWcnA'],
  ['machine_seated_leg_curl', 'Zg3XY7P'],
]);
const originalVideos = new Map([
  ['machine_leg_press', ['QwBvFgAVOTo', 'https://www.kenoshaymca.org/y-videos/']],
  ['machine_lat_pulldown', ['tK35eqRNrPM', 'https://www.kenoshaymca.org/y-videos/']],
  ['machine_hip_abduction', ['RNLTuarDpTA', 'https://www.kenoshaymca.org/y-videos/']],
  ['machine_ab_crunch', ['nlqEDo8odJM', 'https://www.kenoshaymca.org/y-videos/']],
  ['dorm_supported_dumbbell_row', ['q65uDGJ9ZPs', 'https://www.youtube.com/watch?v=q65uDGJ9ZPs']],
  ['dorm_dumbbell_floor_press', ['vagdk94bFn4', 'https://support.runna.com/en/articles/6413209-floor-dumbbell-bench-press-exercise-tutorial']],
  ['dorm_sit_to_stand', ['29WFLqHgYZ0', 'https://www.youtube.com/watch?v=29WFLqHgYZ0']],
  ['dorm_dead_bug', ['bxn9FBrt4-A', 'https://www.nasm.org/resource-center/exercise-library/dead-bug']],
]);

test('动作库覆盖 11 个约定 ID，且可按 ID 精确索引', () => {
  assert.deepEqual(exercises.map(({ id }) => id), expectedIds);
  assert.equal(exerciseById.size, expectedIds.length);
  for (const exercise of exercises) assert.equal(exerciseById.get(exercise.id), exercise);
});

test('每个动作保留文字指导和可用性出口', () => {
  for (const exercise of exercises) {
    for (const field of ['name', 'equipment', 'start', 'movement', 'textFallback', 'firstUseReminder']) {
      assert.ok(exercise[field]?.trim(), `${exercise.id}: ${field}`);
    }
    assert.ok(exercise.muscles.length, `${exercise.id}: muscles`);
    assert.ok(exercise.cues.length >= 2 && exercise.cues.length <= 3, `${exercise.id}: cues`);
    assert.ok(exercise.errors.length && exercise.stopSignals.length, exercise.id);
    for (const alternative of exercise.alternatives) {
      assert.ok(exerciseById.has(alternative), `${exercise.id}: ${alternative}`);
      assert.notEqual(alternative, exercise.id);
    }
    const { demo } = exercise;
    assert.ok(['verified', 'unavailable'].includes(demo.verificationStatus), exercise.id);
    assert.match(demo.source, /^https:\/\//, exercise.id);
    assert.match(demo.checkedDate, /^\d{4}-\d{2}-\d{2}$/, exercise.id);
    assert.ok(['external_gif', 'source_video'].includes(demo.mediaType), exercise.id);
    if (demo.verificationStatus === 'unavailable') {
      assert.equal(demo.url, null);
      assert.equal(demo.embed, null);
    }
  }
});

test('三个连续 GIF 精确对应动作，来源与使用限制明确', () => {
  for (const [id, mediaId] of gifs) {
    const { demo } = exerciseById.get(id);
    assert.equal(demo.mediaType, 'external_gif', id);
    assert.equal(demo.gifUrl, `https://static.exercisedb.dev/media/${mediaId}.gif`, id);
    assert.equal(demo.gifSource, 'https://ascendapi.com/', id);
    assert.match(demo.gifLicense, /个人.*非商业.*AscendAPI.*ExerciseDB/, id);
  }
});

test('其余八个动作保留核验过的原视频入口与来源', () => {
  for (const [id, [videoId, source]] of originalVideos) {
    const { demo } = exerciseById.get(id);
    assert.equal(demo.mediaType, 'source_video', id);
    assert.equal(demo.source, source, id);
    assert.equal(demo.verificationStatus, 'verified', `${id}: 已核验的原视频不应无故停用`);
    assert.equal(demo.url, `https://www.youtube.com/watch?v=${videoId}`, id);
    assert.equal(demo.embed, `https://www.youtube.com/embed/${videoId}`, id);
    assert.ok(demo.provider && demo.license, id);
  }
  assert.equal(gifs.size + originalVideos.size, exercises.length);
});
