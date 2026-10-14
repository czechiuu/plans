import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { launchBrowser } from '../scripts/test-helpers/browser.mjs'
import { report, runCase } from '../scripts/test-helpers/report.mjs'

const ids=['SVG_RENDER','THREE_POSE_SEQUENCE','PAUSE_RESUME']
const cases=[],details=[]
const svg=await readFile(new URL('../public/media/exercises/dorm_dead_bug.svg',import.meta.url),'utf8')
let browser
try{
  browser=await launchBrowser()
  const page=await browser.newPage({reducedMotion:'no-preference'})
  await page.setContent(svg)
  await runCase(cases,details,ids[0],async()=>{
    assert.equal(await page.evaluate(source=>new DOMParser().parseFromString(source,'image/svg+xml').querySelector('parsererror')===null,svg),true)
    assert.ok(await page.locator('svg').evaluate(element=>element.getBBox().width>0))
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.a,.b')].map(node=>node.getAnimations().length)),[1,1,1])
  })
  await runCase(cases,details,ids[1],async()=>{
    for(const [time,visible,caption] of [
      [0,0,'起点'],[1500,1,'右臂＋左腿'],[2700,0,'起点'],[3540,2,'左臂＋右腿'],[4800,0,'起点']
    ]){
      const pose=await page.evaluate(time=>{
        const nodes=[...document.querySelectorAll('.a,.b')]
        for(const node of nodes)node.getAnimations()[0].currentTime=time
        return nodes.map(node=>({opacity:Number(getComputedStyle(node).opacity),caption:node.querySelector('text')?.textContent||''}))
      },time)
      assert.ok(pose[visible].opacity>0.9)
      assert.ok(pose.every((item,index)=>index===visible||item.opacity<0.1))
      assert.ok(pose[visible].caption.includes(caption))
    }
  })
  await runCase(cases,details,ids[2],async()=>{
    await page.evaluate(()=>document.querySelectorAll('.a,.b').forEach(node=>node.style.animationPlayState='paused'))
    const before=await page.locator('.b.right').evaluate(node=>node.getAnimations()[0].currentTime)
    await page.waitForTimeout(120)
    assert.equal(await page.locator('.b.right').evaluate(node=>node.getAnimations()[0].currentTime),before)
    await page.evaluate(()=>document.querySelectorAll('.a,.b').forEach(node=>node.style.animationPlayState='running'))
    await page.waitForTimeout(120)
    assert.ok(await page.locator('.b.right').evaluate(node=>node.getAnimations()[0].currentTime)>before)
  })
}catch(error){
  if(!cases.some(item=>item.status==='failed')){cases.push({id:'SVG_SETUP',status:'failed'});details.push({id:'SVG_SETUP',error})}
}finally{
  await browser?.close()
  for(const id of ids)if(!cases.some(item=>item.id===id))cases.push({id,status:'notrun'})
  await report('frontend-dead-bug','local-original-svg-browser-check',cases,details)
}
