// The app uses this small, fixed JSON Schema subset for all AI responses.
export function matchesSchema(schema,value){
  if(schema.anyOf) return schema.anyOf.some(part=>matchesSchema(part,value))
  if(schema.enum && !schema.enum.includes(value)) return false
  if(schema.type==='null') return value===null
  if(schema.type==='string') return typeof value==='string' &&
    (schema.maxLength===undefined || [...value].length<=schema.maxLength) &&
    (schema.pattern===undefined || new RegExp(schema.pattern).test(value))
  if(schema.type==='integer') return Number.isInteger(value) &&
    (schema.minimum===undefined || value>=schema.minimum) &&
    (schema.maximum===undefined || value<=schema.maximum)
  if(schema.type==='number') return typeof value==='number' && Number.isFinite(value)
  if(schema.type==='array') return Array.isArray(value) &&
    (schema.minItems===undefined || value.length>=schema.minItems) &&
    (schema.maxItems===undefined || value.length<=schema.maxItems) &&
    value.every(item=>matchesSchema(schema.items,item))
  if(schema.type==='object') return value!==null && typeof value==='object' && !Array.isArray(value) &&
    (schema.required??[]).every(key=>Object.hasOwn(value,key)) &&
    Object.entries(value).every(([key,item])=>{
      if(!Object.hasOwn(schema.properties,key)) return schema.additionalProperties!==false
      return matchesSchema(schema.properties[key],item)
    })
  return false
}
