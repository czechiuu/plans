# 两个人的日常

中文、手机优先的私人双人饮食与运动网站。第一阶段前端已发布：[https://czechiuu.github.io/plans/](https://czechiuu.github.io/plans/)。Supabase 免费项目和数据库已就绪，**真实三账号业务权限、邮件与两台物理设备仍未验收，因此还不能导入真实健康档案或进入第二阶段**。当前证据见 [STATUS.md](STATUS.md)。

第一阶段提供独立邮箱账号、最多两人的邀请空间、本人档案、手动日程与体重、默认私有的类别加单条共享、另行授权代改、编辑冲突、本人导出/清除及退出空间。另一设备需手动刷新。自然语言解析、AI 计划、照片、餐食和 20:00 自动生成尚未实现；没有假登录或演示健康资料。

## 本地运行与配置

需要 Node.js 22+、pnpm。新克隆先将空白 [.env.example](.env.example) 复制为 `.env.local`，只填当前项目的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 两项公共配置；本机已有 `.env.local`，但它被 Git 忽略，不随仓库提供。部署使用 GitHub Actions 的同名公共 Variables。不得把管理员、SMTP、AI、`secret` 或 `service_role` 密钥放入前端、仓库或聊天。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm test:concurrency
pnpm build
```

测试环境必须分开：

- `pnpm test` 使用 PGlite/合成 Auth；`pnpm test:concurrency` 在独立本地 PostgreSQL 多连接复现旧问题并验证修复。二者不访问云项目。
- `pnpm test:browser:unconfigured` 须连接单独的未配置 Vite 进程。下面的 Node 命令在子进程中显式保留两项空值，即使本机存在 `.env.local` 也不会加载其值；不要只在旧版 PowerShell 用 `$env:...=''`，那可能删除环境变量。第一个终端运行：

  ```sh
  node -e "const {spawn}=require('node:child_process'); const p=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5181','--strictPort'],{stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:''}}); p.on('exit',code=>process.exit(code??1))"
  ```

  第二个 PowerShell 终端运行 `$env:TEST_SITE_URL='http://127.0.0.1:5181'; pnpm test:browser:unconfigured`。测试后停止第一个进程；不要复用已配置的 dev/preview。
- `pnpm test:browser:mock` 使用合成资料和替换的内存 API，只验证界面；不能算真实 Supabase 通过。
- `pnpm test:cloud` 与 `pnpm test:browser:cloud` 使用专用合成 A/B/C 账号和**进程环境**中的 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、三个 `TEST_*_EMAIL/PASSWORD`、`TEST_ACCOUNTS_ARE_DISPOSABLE=YES`；真实页面另用 `E2E_BASE_URL` 指向实际 HTTPS 网页或已配置的 production preview。脚本**不会自动读取 `.env.local`**，公共前端配置已存在不代表云测可运行；真实浏览器检查不能用 Vite dev 页。需要本机忽略文件时显式用 `node --env-file=.env.cloud-test scripts/verify-cloud.mjs` 或对应 cloud-browser 脚本，不提交文件或输出密码。

截至本轮，本地 23 单元、5 并发、2 未配置页、5 模拟界面均通过；已带项目公共配置和网页地址重跑云端检查，真实 API 11 和真实页面 7 项目前只因缺 A/B/C 测试账号凭据及一次性测试账号确认标志而阻塞。云端 14 项结构/ACL 与 8 项匿名拒绝已通过；首次部署匿名页面检查 8 通过、1 失败（图标 404）、3 项需账号或真机未运行。图标代码已修、构建通过，仍待重新部署和复测。这些结果不能代替三账号授权和真机。详细分类及证据见 [测试清单](docs/TEST-CHECKLIST.md)。

## 云端与部署

Supabase 免费项目 `czechiuu's Project`（ref `wnzbtitlvteptkvwhavw`，ap-south-1 Mumbai/NANO）经空库核对后，在 SQL Editor 的事务中按序应用 [001](supabase/migrations/202610130001_initial.sql) 与 [002](supabase/migrations/202610130002_space_lock_order.sql)，并核对迁移历史、RLS 与 RPC 权限。已有库不得重跑 001，只能核实后增加补丁。公开构建使用项目 URL 与 publishable key，健康资料由 Auth 和数据库行级权限保护。

GitHub Pages 通过 [手动运行 38375922987](https://github.com/czechiuu/plans/actions/runs/38375922987) 完成 test-build 与 deploy；当前部署源码 `605c8dad48cef31cbffa72d7056016dd0910f596`。本轮新增证据和文档还未形成新提交。网页部署成功不等于真实账号可用。Auth Site URL 已保存为实际网址，`/plans/` 与 `/plans/index.html` 两条精确 Redirect URL 已保存并回读确认，见 [配置回读报告](test-results/cloud-auth-config-results.json)。Custom SMTP 尚未开启；个人 QQ 邮箱 SMTP 已作为免费候选提出，待用户选择、配置和验证投递。保留 Confirm Email，不通过关闭确认或给测试邮箱组织权限绕过发信限制；新增服务及可能费用仍待确认。

邮箱确认/重置、三账号共享与隔离、删除后数据库计数见 [云端验收](docs/CLOUD-ACCEPTANCE.md)；两台物理设备仅需 [5 步人工流程](docs/DEVICE-ACCEPTANCE.md)。这些通过前不要导入被 Git 忽略的 `private/` 真实档案。照片和 AI 未启用，资料不会发送到外部 AI。

更多约定：[需求](docs/REQUIREMENTS.md) · [数据权限与删除边界](docs/DATA-MODEL.md) · [架构与费用](docs/ARCHITECTURE.md) · [开发规则](AGENTS.md)。
