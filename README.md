# 两个人的日常

中文、手机优先的私人双人饮食与运动网站。[固定账号版网页](https://czechiuu.github.io/plans/) 已上线（源码 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`），实际刷新可见“我/W”与密码入口，页面无注册/找回入口。003 与两账号同空间初始化也已在云端完成。真实 API 已通过；浏览器当前仍有切账号超时，双物理设备未测，完成前不导入真实健康档案。实际进展见 [STATUS.md](STATUS.md)。

第一阶段目标是两位指定的 Supabase 密码用户共享一个空间，分别管理本人档案、手动日程和体重。新记录默认私有；类别与单条共享同时开启后，对方才可看。代改另需授权并记录修改者。本人可导出、清除健康数据和退出空间；退出后联系管理员重新关联。新用户不能自行注册、建空间或使用邀请码。自然语言解析、AI 计划、照片、餐食和 20:00 自动生成属于后续阶段。

## 本地运行与配置

需要 Node.js 22+、pnpm。新克隆复制 [.env.example](.env.example) 为被 Git 忽略的 `.env.local`，只填 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY` 两项公共配置；部署由 GitHub Actions 使用同名公共 Variables。密码、管理员密钥和健康资料不得写进前端、`.env.local`、仓库或聊天。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm test:concurrency
pnpm build
```

`pnpm test` 使用 PGlite 和合成 Auth，41 通过、0 失败；`pnpm test:concurrency` 使用独立本地 PostgreSQL 多连接，5 通过、0 失败，均不访问云项目。未配置页 2 通过、模拟界面 6 通过，均 0 失败，但不能代替云端权限。实际证据见 [测试清单](docs/TEST-CHECKLIST.md)。

真实云端验收在项目根目录运行；只复测浏览器时加 `--browser-only`：

```sh
node scripts/run-fixed-cloud-tests.mjs
node scripts/run-fixed-cloud-tests.mjs --browser-only
```

如 `node` 不在 PATH，可把命令中的 `node` 换为可执行文件的绝对路径。运行器只读 Git 忽略的 `.env.local` 中两项**公共**配置，校验必须是本项目 URL 与 publishable key；默认只测正式 HTTPS 页面。它要求交互式终端：输入 `YES` 后逐一隐藏输入并验证“我/W”密码，有进度提示；默认顺序执行 API 与浏览器检查（API 失败仍运行浏览器），`--browser-only` 仅复测浏览器。结束后清除密码进程环境、显示本轮报告状态并等 Enter 关闭。Windows 中途取消若仍等待网络，可能需再按一次 Enter 才退出；本地合成测试证实终端输入模式会恢复。密码不写文件、命令参数或日志。裸 `pnpm test:cloud` 和 `pnpm test:browser:cloud` **不会自动读取** `.env.local`，缺少进程配置会明确阻塞。仅在管理员核实账号、空间和现有数据后运行；测试只写本轮合成记录，核对后逐条清理，禁止对生产全量清除。第三账号隔离由本地合成 Auth 测试验证，生产不创建第三用户。本机 PowerShell 执行策略曾阻止旧 `.ps1` 入口，未更改系统策略；该次云业务没有运行，不能算云端失败。

## 云端与管理员

Supabase 免费项目 `czechiuu's Project`（ref `wnzbtitlvteptkvwhavw`）已按序应用 [001](supabase/migrations/202610130001_initial.sql)、[002](supabase/migrations/202610130002_space_lock_order.sql)、[003](supabase/migrations/202610130003_fixed_accounts.sql)，并事务执行 [管理员初始化 SQL](supabase/admin/initialize-fixed-accounts.sql)。提交后 [12 项结构回验](test-results/cloud-fixed-setup-results.json)通过、0 失败；云测后管理员[当前表清理回读](test-results/cloud-cleanup-readback-results.json)8 通过、0 失败，档案/日程/体重均为 0、共享/代改全关。此回读不证明备份擦除。不要重跑历史迁移；浏览器整条流程仍待完成。操作边界和改密状态见 [固定账号说明](docs/FIXED-ACCOUNTS.md)。

当前 GitHub Pages 固定账号版来自 [运行 38393501421](https://github.com/czechiuu/plans/actions/runs/38393501421)，test-build 于 2026-10-13 11:54:50—11:55:13 UTC 成功，deploy 于 11:55:16—11:56:22 UTC 成功，部署源码 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`；74 个公开文件核对一致。[匿名发布页检查](test-results/fixed-deployment-results.json) 8 通过、0 失败，桌面和手机截图仅含匿名状态；真实 API 已以两位账号验证 11 通过、0 失败；浏览器当前 9 通过、1 失败：实际两账号登录、保存刷新、共享、导出与清理已通过，切账号步骤超时；受控本地时序复现 1 通过、0 失败，真实浏览器待用户安全输入复测。前两轮失败记录保留。真实云端的公开注册已关闭并保存；修改密码需当前密码已开启，Email 与 Confirm email 保持开启，Secure password change 保持关闭，见 [刷新后回读](test-results/cloud-fixed-auth-config-results.json)。Custom SMTP 未配置，本轮取消注册/重置邮件验收，不承诺邮件可投递。忘记密码可由管理员使用本地 [固定账号改密工具](docs/FIXED-ACCOUNTS.md#改密与遗忘密码)；工具单测 3 通过、0 失败，已含在本地 41 项内，尚未在生产执行。

更多约定：[需求](docs/REQUIREMENTS.md) · [数据权限](docs/DATA-MODEL.md) · [架构](docs/ARCHITECTURE.md) · [开发规则](AGENTS.md)。
