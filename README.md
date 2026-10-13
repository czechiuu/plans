# 两个人的日常

中文、手机优先的私人健康网站：[实际网站](https://czechiuu.github.io/plans/)。沿用原 Supabase 和“我 / W＋各自密码”，独立身份、默认私有，双层共享和代填授权由本人控制。

生产目前是固定账号基础版（源码 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`，[部署运行](https://github.com/czechiuu/plans/actions/runs/38393501421)）。本轮六页界面、计划/训练/餐食、私人照片、服务端 AI 和定时任务已写代码并本地验证；**004、函数、AI 和定时尚未在生产执行**。真实状态见 [STATUS.md](STATUS.md)。

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

实际通过：单元56、历史并发5、健康并发11、迁移包7、未配置页面2、模拟界面15，均0失败。未配置与模拟测试使用独立前端进程；未配置进程明确清空两项 VITE 变量。模拟接口通过不能代替云端。见[测试清单](docs/TEST-CHECKLIST.md)。

## 真实云端测试

在交互终端安全输入两账号密码，不回显、不存文件或命令参数：

```sh
node scripts/run-fixed-cloud-tests.mjs
node scripts/run-fixed-cloud-tests.mjs --browser-only
node scripts/run-fixed-cloud-tests.mjs --health-only
```

运行器只读取 `.env.local` 的两项公共配置，先验证密码，再运行所选测试。只写本轮唯一标记的合成记录，按精确 ID 清理；已有健康数据可能受影响的共享测试会阻塞，不清空生产库。默认测试正式 HTTPS 页面。取消时恢复终端模式；网络有超时；失败/阻塞不假成功。

裸 `pnpm test:cloud`、`pnpm test:cloud:health`、`pnpm test:browser:cloud` **不会自动加载 `.env.local`**，需要进程环境 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`TEST_ME_PASSWORD`、`TEST_W_PASSWORD`、`TEST_FIXED_ACCOUNTS_APPROVED=YES`；浏览器还需 `E2E_BASE_URL`。优先使用安全运行器，勿将密码写命令。第三用户隔离仅在独立合成 Auth 环境验证，生产不创建第三账号或开放注册。

新版真实云端与真机尚未执行；旧 API 11/0、旧网页9/1仅为历史证据。邮件与邀请已取消，不算通过。

## 部署与使用

管理员沿用原项目 `wnzbtitlvteptkvwhavw`，按[部署说明](docs/HEALTH-DEPLOY.md)执行核对历史的004一次包，再部署三个函数。不得重跑001–003或重置数据。GitHub **Test and publish frontend** 需手动运行才发布；普通 push 只测试构建。必须以实际 deployment 成功及页面检查确认上线。

登录后在设置中确认当前档案、器械/伤情限制和三餐模板；历史基线不视为今天体重。安排保存前核对人物、日期、时段；计划和实际完成各自保存。估算草稿确认后才计入，缺失记录不等于没吃。另一设备刷新读最新数据。本人可导出/删除，退出空间后需管理员重新关联；照片对象删除失败会中止后续清除并显示错误。

文字和照片 AI 分别同意；未配置显示原因，手动记录继续可用。自动餐食目前沿用本人确认模板；20:00代码为服务器队列，但尚未实际启用验收。站内提示不是手机推送。

[固定账号与人工改密](docs/FIXED-ACCOUNTS.md) · [双设备验收](docs/DEVICE-ACCEPTANCE.md) · [AI 数据/费用](docs/AI-CONFIG.md) · [动作来源](docs/EXERCISE-SOURCES.md) · [需求](docs/REQUIREMENTS.md) · [数据结构](docs/DATA-MODEL.md) · [开发规则](AGENTS.md)。
