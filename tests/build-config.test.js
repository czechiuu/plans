import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('构建前读取env.local拒绝私钥，不把密钥印进错误',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pair-health-config-'));
  const synthetic='sb_secret_synthetic_build_test_only_123';
  try{
    await writeFile(join(directory,'.env.local'),`VITE_SUPABASE_URL=https://syntheticproject.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=${synthetic}\n`);
    const env={...process.env};delete env.VITE_SUPABASE_URL;delete env.VITE_SUPABASE_PUBLISHABLE_KEY;
    let rejected=false;
    try{execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/check-public-config.mjs',import.meta.url))],{cwd:directory,env,stdio:'pipe'});}
    catch(error){rejected=true;assert.equal(error.status,1);assert.equal(error.stderr.toString().includes(synthetic),false);assert.match(error.stderr.toString(),/密钥类型不允许/);}
    assert.equal(rejected,true);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('正式部署未配置必须非零退出，不能发布空后台配置',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pair-health-required-'));
  try{
    const env={...process.env};delete env.VITE_SUPABASE_URL;delete env.VITE_SUPABASE_PUBLISHABLE_KEY;
    assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/check-public-config.mjs',import.meta.url)),'--required'],{cwd:directory,env,stdio:'pipe'}),error=>error.status===1);
  }finally{await rm(directory,{recursive:true,force:true});}
});
