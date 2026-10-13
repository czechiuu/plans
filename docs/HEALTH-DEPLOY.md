# 健康功能部署（004）

本文件是管理员执行清单。源码和三份 Edge bundle 均不含密钥；当前生产是否已部署以实际回读为准，不能仅看本文件。只对原有固定双账号项目部署，不新建项目或账号。

1. 备份现有数据。在项目根目录运行 `node scripts/prepare-health-migration.mjs`，将生成的 [004 一次执行包](../supabase/admin/apply-health-004.sql) 全文粘贴到本项目 SQL Editor 执行。执行包先核对 001–003 的历史原文哈希与固定双账号，再在**同一事务**执行 [004 原文](../supabase/migrations/202610130004_health_daily.sql) 并登记 `statements[1]`；已有相同 004 则不重复执行，不同哈希或前置条件不符则报错回滚。004 创建新表、RPC、私有 `health-photos` bucket。执行后回读迁移哈希与表权限；不得关闭 RLS。
2. 配置 Edge Function Secrets：`HEALTH_ALLOWED_ORIGINS=https://czechiuu.github.io`；如需本地开发，另外列入确切的 `http://localhost:5173`、`http://127.0.0.1:5173`，逗号分隔，不用通配。Supabase 自动提供 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`；函数缺少任一项会明确失败。三函数网关均设 `verify_jwt=false`：`health-ai`、`health-photo` 在函数内用 Supabase Auth `getUser` 核实用户 JWT，再核固定账号及当前空间；匿名和仅持公开 key 的调用不能进入业务。`health-cron` 只接受服务端随机 `HEALTH_CRON_SECRET`（至少 32 字符）并校验 `x-cron-secret`，绝不把这个值放前端。关闭网关校验可兼容本项目 ES256 用户令牌，并让无令牌 OPTIONS 预检到达函数。
3. 项目根目录运行 `pnpm build:edge`，生成 [health-ai.js](../supabase/bundles/health-ai.js)、[health-photo.js](../supabase/bundles/health-photo.js)、[health-cron.js](../supabase/bundles/health-cron.js)。分别作为同名 Supabase Edge Function 的单文件源码部署。`supabase/config.toml` 已声明三项网关 JWT 开关；通过 Dashboard 部署时也须逐项核对。构建成功只证明可打包，须实际验收 OPTIONS 中 `x-client-info`、本人登录调用、匿名拒绝、私有照片下载/撤销。
4. 定时任务：启用项目的 `pg_cron`、`pg_net` 和 Vault；由管理员在 Vault 填 `health_project_url`、`health_publishable_key`、`health_cron_secret`，最后一个与 Edge 的 `HEALTH_CRON_SECRET` 相同。确认值只在 Dashboard 安全输入，不进 SQL 文件/日志。审核后运行 [定时脚本](../supabase/admin/schedule-health-cron.sql)，每 5 分钟调用一次函数，函数按最近一次上海 20:00 的 `scheduled_for` 幂等排本人次日任务，迟到跨午夜仍用原目标日。两人独立发布，失败有限重试；检查 `cron.job` 与 `net._http_response` 只读状态和本人 `generation_jobs`，不把 HTTP 响应中的健康原文写日志。
5. AI 默认关闭。已获用户许可的费用边界是全站上海自然月最多 $2，其中 DeepSeek 固定合成测试最多 $0.10。先运行 `node scripts/prepare-ai-provider-migration.mjs`，审阅 [005 一次执行包](../supabase/admin/apply-ai-providers-005.sql) 与 [005 源](../supabase/migrations/202610130005_ai_providers.sql) 的 LF MD5 `2c57e2948216f3e08e2170754e1fd883`；执行包核对 001–004 历史和固定双账号，在执行与登记前将粘贴产生的 CRLF 规范为 LF，重复同源执行不重建。005 回读确认后，再由管理员审阅并执行 [本月供应商预算 SQL](../supabase/admin/set-ai-provider-budgets.sql)：全站不超过 200 美分、OpenAI 不超过 200 美分、DeepSeek 合成测试不超过 10 美分，已有更小限额保持不变，已计费/预留账本不清除，未来月份不预设。005 后不要重跑 004 的旧预算 SQL，因为旧脚本会把已有更低全站上限提高到 200 美分。

管理员已在云控制台回读所需两个自定义 Secret 的**名称**存在；未查看或记录值，名称存在不证明密钥有效。DeepSeek 的真实健康资料请求仍被服务端拒绝，合成探针也尚未实际调用。OpenAI 如要发送真实资料，仍须正确配置模型、密钥、费率及本人分用途授权；仅设置预算不会启动 AI。具体授权、探针返回与来源见 [DeepSeek 契约](DEEPSEEK.md)和 [AI 配置说明](AI-CONFIG.md)。
生产验收至少涵盖：两个固定账号分别登录并保存/刷新；对方私有不可见、双重共享可见且撤销后新照片请求拒绝；训练/餐食/计划按本人保存；手动计划不被夜间任务覆盖；20:00 两人 job 目标和独立结果；照片前后去重、删除中断重试、退出前对象清理；匿名无 RPC/表权限。OpenAI 真实调用、费用和双设备同步只有实际配置并运行后才能标通过。

已上传照片的单条 `is_shared` 目前不能事后切换；要撤销单张照片，请删除该照片；关闭本人照片类别共享可立即阻止对方发起新的读取请求。
