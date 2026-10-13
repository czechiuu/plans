import { validateConfig } from '../src/domain.js';
import { loadEnv } from 'vite';

const localEnv = loadEnv('production', process.cwd(), 'VITE_');
const url = process.env.VITE_SUPABASE_URL ?? localEnv.VITE_SUPABASE_URL ?? '';
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? localEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const result = validateConfig(url, key);
if ((!result.configured && (url || key)) || (!result.configured && process.argv.includes('--required'))) {
  process.stderr.write(`${result.error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(result.configured ? '公共配置校验通过；不代表云端权限已验收。\n' : '后端未配置：仅构建未配置说明页面。\n');
}
