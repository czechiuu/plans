import test from 'node:test';
import assert from 'node:assert/strict';
import { exercises, exerciseById } from '../shared/exercises.js';

const expectedIds = [
  'machine_leg_press', 'machine_seated_row', 'machine_chest_press',
  'machine_seated_leg_curl', 'machine_lat_pulldown', 'machine_hip_abduction',
  'machine_ab_crunch', 'dorm_supported_dumbbell_row',
  'dorm_dumbbell_floor_press', 'dorm_sit_to_stand', 'dorm_dead_bug',
];
const verifiedVideos = new Map([
  ['machine_leg_press', 'QwBvFgAVOTo'],
  ['machine_seated_row', 'Hu1Pqz-6OIU'],
  ['machine_chest_press', '0La1aFp-hKA'],
  ['machine_seated_leg_curl', '80AV3aCz65M'],
  ['machine_lat_pulldown', 'tK35eqRNrPM'],
  ['machine_hip_abduction', 'RNLTuarDpTA'],
  ['machine_ab_crunch', 'nlqEDo8odJM'],
  ['dorm_supported_dumbbell_row', 'q65uDGJ9ZPs'],
  ['dorm_dumbbell_floor_press', 'vagdk94bFn4'],
  ['dorm_sit_to_stand', '29WFLqHgYZ0'],
  ['dorm_dead_bug', 'bxn9FBrt4-A'],
]);

test('动作库覆盖 11 个约定 ID，且可按 ID 精确索引', () => {
  assert.deepEqual(exercises.map(({ id }) => id), expectedIds);
  assert.equal(exerciseById.size, expectedIds.length);
  for (const exercise of exercises) assert.equal(exerciseById.get(exercise.id), exercise);
});

test('每个动作有完整文字指导与明确的演示可用边界', () => {
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
    if (demo.verificationStatus === 'verified') {
      const videoId = new URL(demo.url).searchParams.get('v');
      assert.equal(videoId, verifiedVideos.get(exercise.id), `${exercise.id}: 视频不能与核验记录错配`);
      assert.equal(new URL(demo.url).hostname, 'www.youtube.com');
      assert.equal(demo.embed, `https://www.youtube.com/embed/${videoId}`);
      assert.ok(demo.provider && demo.license, exercise.id);
    } else {
      assert.equal(demo.url, null);
      assert.equal(demo.embed, null);
    }
  }
});
