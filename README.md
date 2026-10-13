# 两个人的日常

中文、手机优先的私人健康网站：[实际网站](https://czechiuu.github.io/plans/)。沿用原 Supabase 和“我 / W＋各自密码”，独立身份、默认私有，双层共享和代填授权由本人控制。

生产网站目前仍是固定账号基础版（源码 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`，[部署运行](https://github.com/czechiuu/plans/actions/runs/38393501421)）。应用源码提交 `b1654ddf574a266825a425f23ba00d61c262509a` 的 [push CI](https://github.com/czechiuu/plans/actions/runs/38422347145) 已成功，尚未发布新版前端。原项目已执行 004 健康数据库迁移；005、Edge Function 和定时任务尚未云端部署。真实状态见 [STATUS.md](STATUS.md)。

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

实际通过：本地 `node --test` 全套61/0、受影响项8/0、隔离 PostgreSQL 的 004 包12/0、005并发5/0、未配置页面2/0、模拟界面18/0。`pnpm` 在受限沙箱遇到 EPERM 的运行不计为通过。未配置与模拟测试使用独立前端进程；未配置进程明确清空两项 VITE 变量。模拟接口通过不能代替云端。见[测试清单](docs/TEST-CHECKLIST.md)。

## 真实云端测试

在交互终端安全输入两账号密码，不回显、不存文件或命令参数：

```sh
node scripts/run-fixed-cloud-tests.mjs
node scripts/run-fixed-cloud-tests.mjs --browser-only
node scripts/run-fixed-cloud-tests.mjs --health-only
```

运行器只读取 `.env.local` 的两项公共配置，先验证密码，再运行所选测试。只写本轮唯一标记的合成记录，按精确 ID 清理；已有健康数据可能受影响的共享测试会阻塞，不清空生产库。默认测试正式 HTTPS 页面。取消时恢复终端模式；网络有超时；失败/阻塞不假成功。

裸 `pnpm test:cloud`、`pnpm test:cloud:health`、`pnpm test:browser:cloud` **不会自动加载 `.env.local`**，需要进程环境 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`TEST_ME_PASSWORD`、`TEST_W_PASSWORD`、`TEST_FIXED_ACCOUNTS_APPROVED=YES`；浏览器还需 `E2E_BASE_URL`。优先使用安全运行器，勿将密码写命令。第三用户隔离仅在独立合成 Auth 环境验证，生产不创建第三账号或开放注册。

004 的生产结构与迁移历史已回读 10/0；新版真实双账号健康 API、网页、AI、定时与真机仍待执行。旧 API 11/0、旧网页9/1仅为历史证据。邮件与邀请已取消，不算通过。

## 部署与使用

管理员沿用原项目 `wnzbtitlvteptkvwhavw`；004 已完成，后续按[部署说明](docs/HEALTH-DEPLOY.md)增量执行 005 与函数、调度。不得重跑001–004或重置数据。GitHub **Test and publish frontend** 需手动运行才发布；普通 push 只测试构建。必须以实际 deployment 成功及页面检查确认上线。

登录后在设置中确认当前档案、器械/伤情限制和三餐模板；历史基线不视为今天体重。安排保存前核对人物、日期、时段；计划和实际完成各自保存。估算草稿确认后才计入，缺失记录不等于没吃。另一设备刷新读最新数据。本人可导出/删除，退出空间后需管理员重新关联；照片对象删除失败会中止后续清除并显示错误。

新版 AI 按服务商和日程解析、计划生成、文字估餐、图片估餐四种用途分别同意，旧授权不会自动转换；每次调用明确选服务。DeepSeek 目前只允许获批预算内的固定合成探针，不处理个人健康资料。用户已允许本轮探针最多 10 美分并共用全站每月 2 美元上限，但 005、预算与实际调用还未云端验收。自动餐食目前沿用本人确认模板；20:00 代码为服务器队列，尚未实际启用验收。站内提示不是手机推送。

[固定账号与人工改密](docs/FIXED-ACCOUNTS.md) · [双设备验收](docs/DEVICE-ACCEPTANCE.md) · [AI 数据/费用](docs/AI-CONFIG.md) · [动作来源](docs/EXERCISE-SOURCES.md) · [需求](docs/REQUIREMENTS.md) · [数据结构](docs/DATA-MODEL.md) · [开发规则](AGENTS.md)。
