import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateMealNutrition, validateNutritionItem } from '../shared/meal-nutrition.js'

const item = (name, grams_min, grams_max, kcal_per_100g) => ({
  name, grams_min, grams_max, kcal_per_100g, nutrition_source: '合成测试营养标签，非食物营养推荐',
})

test('confirmed mass intervals sum independently, including separately measured oil, and fraction applies once', () => {
  const input = [item('测试食物甲', 120, 160, 250), item('测试食物乙', 50, 80, 40), item('测试油', 5, 10, 900)]
  const before = JSON.stringify(input)
  const result = calculateMealNutrition(input, { additions_status: 'included', eaten_fraction: 0.75 })
  // Independent arithmetic: 300 + 20 + 45 = 365; 400 + 32 + 90 = 522.
  assert.equal(result.complete, true)
  assert.equal(result.energy_min_kcal, 365)
  assert.equal(result.energy_max_kcal, 522)
  assert.equal(result.consumed_min_kcal, 273.75)
  assert.equal(result.consumed_max_kcal, 391.5)
  assert.deepEqual(result.gaps, [])
  assert.equal(JSON.stringify(input), before)
})

test('an unknown item or unmeasured additions never become zero in a whole-meal total', () => {
  const known = item('已量项目', 100, 100, 200)
  const missing = { name: '未知项目', portion: '一大碗', unit: '碗' }
  for (const result of [
    calculateMealNutrition([known, missing], { additions_status: 'none' }),
    calculateMealNutrition([known]),
    calculateMealNutrition([], { additions_status: 'none' }),
    calculateMealNutrition([known, missing], { additions_status: 'none', eaten_fraction: 0 }),
  ]) {
    assert.equal(result.complete, false)
    assert.equal(result.energy_min_kcal, null)
    assert.equal(result.energy_max_kcal, null)
    assert.equal(result.consumed_min_kcal, null)
    assert.equal(result.consumed_max_kcal, null)
    assert.ok(result.gaps.length)
  }
  const result = calculateMealNutrition([known, missing], { additions_status: 'none' })
  assert.equal(result.gaps[0].index, 1)
  assert.deepEqual(result.gaps[0].fields, ['grams_min', 'grams_max', 'kcal_per_100g', 'nutrition_source'])
})

test('numeric strings, reversed bounds, missing provenance, negative and nonfinite values are invalid', () => {
  const valid = item('测试项目', 0, 100, 0)
  assert.deepEqual(validateNutritionItem(valid), [])
  for (const [field, value] of [
    ['grams_min', -1], ['grams_max', '100'], ['kcal_per_100g', NaN],
    ['grams_max', Infinity], ['nutrition_source', '  '], ['name', ''],
  ]) assert.ok(validateNutritionItem({ ...valid, [field]: value }).includes(field))
  assert.ok(validateNutritionItem({ ...valid, grams_min: 200 }).includes('grams_max'))
  assert.deepEqual(validateNutritionItem(null), ['item'])
  assert.deepEqual(validateNutritionItem([]), ['item'])
})

test('zero, full intake and decimal labels preserve explicit quantities without rounding or guessing', () => {
  const items = [item('测试项目', 25, 25, 123.4)]
  const full = calculateMealNutrition(items, { additions_status: 'none', eaten_fraction: 1 })
  assert.equal(full.energy_min_kcal, 30.85)
  assert.equal(full.consumed_min_kcal, 30.85)
  const zero = calculateMealNutrition(items, { additions_status: 'none', eaten_fraction: 0 })
  assert.equal(zero.energy_min_kcal, 30.85)
  assert.equal(zero.consumed_min_kcal, 0)
  assert.equal(calculateMealNutrition([item('标签标为零的项目', 100, 100, 0)], { additions_status: 'none' }).energy_max_kcal, 0)
})

test('invalid meal-level input and arithmetic overflow fail explicitly', () => {
  const items = [item('测试项目', 100, 100, 1)]
  for (const value of [-0.1, 1.01, '0.5', null, NaN, Infinity])
    assert.throws(() => calculateMealNutrition(items, { eaten_fraction: value }), RangeError)
  assert.throws(() => calculateMealNutrition(null), TypeError)
  assert.throws(() => calculateMealNutrition(items, { additions_status: 'guessed' }), RangeError)
  assert.throws(() => calculateMealNutrition([item('过大输入', Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE)], { additions_status: 'none' }), RangeError)
})
