# 两个人的日常

中文、手机优先的私人健康网站：[实际网站](https://czechiuu.github.io/plans/)。沿用原 Supabase 和“我 / W＋各自密码”，独立身份、默认私有，双层共享和代填授权由本人控制。

新版 `b55346a6001ff21ff91f70d4e6e76dd607b2625a` 已在[实际网站](https://czechiuu.github.io/plans/)发布：[push CI](https://github.com/czechiuu/plans/actions/runs/38429761363)、[手动发布](https://github.com/czechiuu/plans/actions/runs/38430307904)均成功。后续 UUID 修复源码 `69006400aee6f603073579ae5bfb9af9896070e1` 的 [CI](https://github.com/czechiuu/plans/actions/runs/38442975458)成功，AI 和 cron 两函数已部署修复；前端、照片函数仍为 `b55346a`。原项目已执行 004、005 迁移及预算，五分钟调度已配置；公开页面和匿名边界通过，不等于真实账号或完整功能已验收。真实状态见 [STATUS.md](STATUS.md)。

## 本地运行

需要 Node.js 22+、pnpm。复制 [.env.example](.env.example) 为被忽略的 `.env.local`，只填 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY` 公共配置；GitHub Actions 使用同名公共 Variables。密码、服务端密钥和健康档案不放前端、仓库或聊天。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm test:concurrency
pnpm test:concurrency:health
pnpm build
pnpm build:edge
```

实际通过：此前本地 `node --test` 全套61/0；随后受影响项8/0、合成探针定向3/0、UUID/cron定向6/0，计数不合并。隔离 PostgreSQL 的 004 包12/0、005并发5/0、未配置页面2/0、模拟界面18/0。`pnpm` 在受限沙箱遇到 EPERM 的运行不计为通过。未配置与模拟测试使用独立前端进程；未配置进程明确清空两项 VITE 变量。模拟接口通过不能代替云端。见[测试清单](docs/TEST-CHECKLIST.md)。

## 真实云端测试

在交互终端安全输入两账号密码，不回显、不存文件或命令参数：

```sh
node scripts/run-fixed-cloud-tests.mjs
node scripts/run-fixed-cloud-tests.mjs --browser-only
node scripts/run-fixed-cloud-tests.mjs --health-only
```

运行器只读取 `.env.local` 的两项公共配置，先验证密码，再运行所选测试。只写本轮唯一标记的合成记录，按精确 ID 清理；已有健康数据可能受影响的共享测试会阻塞，不清空生产库。默认测试正式 HTTPS 页面。取消时恢复终端模式；网络有超时；失败/阻塞不假成功。

裸 `pnpm test:cloud`、`pnpm test:cloud:health`、`pnpm test:browser:cloud` **不会自动加载 `.env.local`**，需要进程环境 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`TEST_ME_PASSWORD`、`TEST_W_PASSWORD`、`TEST_FIXED_ACCOUNTS_APPROVED=YES`；浏览器还需 `E2E_BASE_URL`。优先使用安全运行器，勿将密码写命令。第三用户隔离仅在独立合成 Auth 环境验证，生产不创建第三账号或开放注册。

004 生产结构与历史回读 10/0，005 配置回查 7/0；新版公开页面 8/0、修复后匿名 Edge 边界 14/0。DeepSeek 固定合成探针最新四项覆盖 4/0，历史五次响应共 4/1。真实双账号健康 API、已登录网页、完整 AI、20:00 自动执行与真机仍待验收。旧 API 11/0、旧网页9/1仅为历史证据。邮件与邀请已取消，不算通过。

## 部署与使用

管理员沿用原项目 `wnzbtitlvteptkvwhavw`；004、005、函数和调度配置已下发。Vault 与 Edge 的调度密钥核对四项均通过；UUID 修复后，cron 已领取两项任务，但因两人餐食模板未确认而失败、未生成计划。勿重跑001–005或重置数据。GitHub **Test and publish frontend** 已手动发布 `b55346a` 前端；以后普通 push 仍只测试构建，前端新修改需再次手动发布。cron 请求返回或定时配置不证明 20:00 执行成功。

登录后在设置中确认当前档案、器械/伤情限制和三餐模板；历史基线不视为今天体重。安排保存前核对人物、日期、时段；计划和实际完成各自保存。估算草稿确认后才计入，缺失记录不等于没吃。另一设备刷新读最新数据。本人可导出/删除，退出空间后需管理员重新关联；照片对象删除失败会中止后续清除并显示错误。

新版 AI 按服务商和日程解析、计划生成、文字估餐、图片估餐四种用途分别同意，旧授权不会自动转换；每次调用明确选服务。DeepSeek 只允许最多 10 美分的固定合成探针，共用全站每月 2 美元上限，不处理个人健康资料；日程复测通过，最新四项覆盖 4/0，历史一次失败保留。五条 SQL settled，计费记录 5 美分/10 美分限额、reserved=0；余额差额为 0，不能断言免费。自动餐食沿用本人确认模板；两人模板当前未确认，需本人在设置核对餐食与训练条件，新版真实权限验收前不导入原始真实档案。夜间服务默认未切换，实际 20:00 执行未验收；站内提示不是手机推送。

[固定账号与人工改密](docs/FIXED-ACCOUNTS.md) · [双设备验收](docs/DEVICE-ACCEPTANCE.md) · [AI 数据/费用](docs/AI-CONFIG.md) · [动作来源](docs/EXERCISE-SOURCES.md) · [需求](docs/REQUIREMENTS.md) · [数据结构](docs/DATA-MODEL.md) · [开发规则](AGENTS.md)。
