// These values must be entered or confirmed by the person recording the meal.
// Food names and portion strings never imply a weight or nutrient density.
export function validateNutritionItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return ['item']
  const fields = []
  if (typeof item.name !== 'string' || !item.name.trim()) fields.push('name')
  for (const field of ['grams_min', 'grams_max', 'kcal_per_100g']) {
    if (!Number.isFinite(item[field]) || item[field] < 0) fields.push(field)
  }
  if (Number.isFinite(item.grams_min) && Number.isFinite(item.grams_max) && item.grams_max < item.grams_min)
    fields.push('grams_max')
  if (typeof item.nutrition_source !== 'string' || !item.nutrition_source.trim()) fields.push('nutrition_source')
  return [...new Set(fields)]
}

/**
 * energy_* is the whole meal, BEFORE eaten_fraction, for the existing estimate.
 * consumed_* applies eaten_fraction exactly once; never scale these values again.
 * included means oils/sauces are separately quantified items; none is an explicit
 * confirmation that there are none. Unmeasured additions prevent a complete total.
 * Sources are user-provided provenance, not claims of external verification.
 */
export function calculateMealNutrition(items, { eaten_fraction = 1, additions_status = 'unmeasured' } = {}) {
  if (!Array.isArray(items)) throw new TypeError('Meal items must be an array')
  if (!Number.isFinite(eaten_fraction) || eaten_fraction < 0 || eaten_fraction > 1)
    throw new RangeError('eaten_fraction must be a number from 0 to 1')
  if (!['none', 'included', 'unmeasured'].includes(additions_status))
    throw new RangeError('Invalid additions_status')

  const gaps = items.flatMap((item, index) => {
    const fields = validateNutritionItem(item)
    return fields.length ? [{ index, name: typeof item?.name === 'string' ? item.name : '', fields }] : []
  })
  if (!items.length) gaps.push({ index: null, name: '食物清单', fields: ['items'] })
  if (additions_status === 'unmeasured') gaps.push({ index: null, name: '未计入的油或酱汁', fields: ['additions_status'] })
  const result = { complete: gaps.length === 0, energy_min_kcal: null, energy_max_kcal: null,
    consumed_min_kcal: null, consumed_max_kcal: null, gaps, additions_status }
  if (!result.complete) return result

  for (const edge of ['min', 'max']) {
    const energy = items.reduce((total, item) => total + item[`grams_${edge}`] / 100 * item.kcal_per_100g, 0)
    if (!Number.isFinite(energy)) throw new RangeError('Meal energy exceeds numeric range')
    result[`energy_${edge}_kcal`] = energy
    result[`consumed_${edge}_kcal`] = energy * eaten_fraction
  }
  return result
}
