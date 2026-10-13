# 两个人的日常

中文、手机优先的私人双人饮食与运动网站。现有 [网页](https://czechiuu.github.io/plans/) 仍是旧版（应用源码 `3ded57c825fa375564d389629dd990858ebf97cf`）；003 与两账号同空间初始化已在云端完成，固定账号新版尚未发布。云端实际登录与两台物理设备通过前不导入真实健康档案。实际进展见 [STATUS.md](STATUS.md)。

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

`pnpm test` 使用 PGlite 和合成 Auth，37 通过、0 失败；`pnpm test:concurrency` 使用独立本地 PostgreSQL 多连接，5 通过、0 失败，均不访问云项目。未配置页 2 通过、模拟界面 6 通过，均 0 失败，但不能代替云端权限。实际证据见 [测试清单](docs/TEST-CHECKLIST.md)。

真实云端脚本 `pnpm test:cloud` 和 `pnpm test:browser:cloud` 需要当前进程环境中的 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`TEST_ME_PASSWORD`、`TEST_W_PASSWORD`、`TEST_FIXED_ACCOUNTS_APPROVED=YES`；页面脚本还需 `E2E_BASE_URL` 指向真实 HTTPS 发布页或配置好的 production preview。脚本不会自动读取 `.env.local`。先在当前终端设置两个公共项目值和页面地址，再用 PowerShell 安全提示输入密码：

```powershell
$meSecret = Read-Host '我：测试密码' -AsSecureString
$wSecret = Read-Host 'W：测试密码' -AsSecureString
$env:TEST_ME_PASSWORD = [System.Net.NetworkCredential]::new('', $meSecret).Password
$env:TEST_W_PASSWORD = [System.Net.NetworkCredential]::new('', $wSecret).Password
$env:TEST_FIXED_ACCOUNTS_APPROVED = 'YES'
try {
  pnpm test:cloud
  pnpm test:browser:cloud
} finally {
  Remove-Item Env:TEST_ME_PASSWORD, Env:TEST_W_PASSWORD, Env:TEST_FIXED_ACCOUNTS_APPROVED -ErrorAction SilentlyContinue
  Remove-Variable meSecret, wSecret -ErrorAction SilentlyContinue
}
```

两个密码只传给当前终端启动的测试进程，**不要**保存进 `.env.local`、`.env.cloud-test`、Shell 历史、报告或日志，也不要作为命令行字面量输入。仅在管理员核实账号、空间和现有数据后运行；测试只写带本轮唯一标记的合成记录，逐行核对后按 ID 清理，禁止对生产全量清除。第三账号隔离由本地合成 Auth 测试验证，生产不创建第三用户。

## 云端与管理员

Supabase 免费项目 `czechiuu's Project`（ref `wnzbtitlvteptkvwhavw`）已按序应用 [001](supabase/migrations/202610130001_initial.sql)、[002](supabase/migrations/202610130002_space_lock_order.sql)、[003](supabase/migrations/202610130003_fixed_accounts.sql)，并事务执行 [管理员初始化 SQL](supabase/admin/initialize-fixed-accounts.sql)。提交后 [12 项只读回验](test-results/cloud-fixed-setup-results.json) 通过、0 失败：仅有两个指定账号与同一空间成员、共享/代改默认关闭，旧建空间/邀请入口关闭。不要重跑历史迁移；结构通过还需真实账号业务验收。操作边界和改密状态见 [固定账号说明](docs/FIXED-ACCOUNTS.md)。

当前 GitHub Pages 部署来自 [运行 38378521147](https://github.com/czechiuu/plans/actions/runs/38378521147)，应用源码 `3ded57c825fa375564d389629dd990858ebf97cf`；远端 main 起点 `952ee259161f32c5d047935b8268e3f84ab19cae`。本地新方案尚未发布。真实云端的公开注册已关闭并保存；修改密码需当前密码已开启，Email 与 Confirm email 保持开启，Secure password change 保持关闭，见 [刷新后回读](test-results/cloud-fixed-auth-config-results.json)。Custom SMTP 未配置，本轮取消注册/重置邮件验收，不承诺邮件可投递。忘记密码可由管理员使用本地 [固定账号改密工具](docs/FIXED-ACCOUNTS.md#改密与遗忘密码)；工具单测 3 通过、0 失败，已含在本地 37 项内，尚未在生产执行。

更多约定：[需求](docs/REQUIREMENTS.md) · [数据权限](docs/DATA-MODEL.md) · [架构](docs/ARCHITECTURE.md) · [开发规则](AGENTS.md)。
