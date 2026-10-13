# 两个人的日常

私人双人饮食与运动管理网站。中文、手机优先、日期统一Asia/Shanghai。**第一阶段源码已上传并通过 Linux CI；Supabase 项目尚未创建，网页尚未发布，不能宣称正式可用。** 当前完整进度、证据与待解决事项见 [STATUS.md](STATUS.md)。

前端：Vite + 原生JavaScript，GitHub Pages部署。后端：Supabase Auth + PostgreSQL RLS/RPC。没有假账号切换、演示健康数据或AI模拟服务；未配置时明确阻止登录和保存。

## 第一阶段功能

独立邮箱账号、最多两人的邀请空间；默认私有档案/日程/体重，双重共享确认、单独代改授权及修改者记录；手动补录/修改/删除、编辑冲突提示、真实记录趋势/7日平均及数量；本人JSON导出、清除数据、退出空间。新档案不会生成体重测量记录。手动刷新读取其他设备最新内容。

AI计划、自然语言解析、20:00后台生成、照片、餐食记录、动作动画和训练记录尚未实现。关闭浏览器自动生成未验收，手机推送未接入。

## 本地运行

需要Node.js 22+、pnpm。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

没有`.env.local`时显示未配置页面。已配置才能使用真实功能：复制`.env.example`为`.env.local`，在本地文件或部署控制台填写 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY`。这是可公开的项目URL/公共密钥；**禁止用secret、service_role、AI或SMTP密钥代替**。所有真正密钥和密码不要贴到聊天或源代码。

```sh
pnpm test
pnpm test:concurrency
pnpm build
# 浏览器检查须先运行pnpm dev；Windows默认使用已有Chrome无头实例
pnpm test:browser:unconfigured
pnpm test:browser:mock
# macOS/Linux没有浏览器时按Playwright官方方法配置，或指定TEST_BROWSER_PATH
```

测试分开执行、分开报告：`test:browser:unconfigured` 检查未配置页面及开发服务器私有路径；`test:browser:mock` 只检查合成资料/内存接口的界面，截图带水印；`test:browser:cloud` 对真实构建页面和真实 Supabase 执行流程，绝不替换 API。旧的混合 `test:browser` 命令已删除。`pnpm test` 使用 PGlite 单连接引擎与合成 Auth fixture，不能证明多连接并发或云端登录。`test:concurrency` 另启本地独立 PostgreSQL 服务，用不同连接及数据库锁等待证据复现旧漏洞并验证修复，不访问云数据库。Windows x64 与 CI Linux x64 的测试二进制版本和安装脚本已固定；其他平台需自行核对对应包的安装脚本。

源码提交 `c03df47c5b44c2fe5a2bb4c7459234a239b63cfe` 的 [Linux GitHub Actions](https://github.com/czechiuu/plans/actions/runs/38361905537) 已通过安装、`pnpm test`（23 项）、`pnpm test:concurrency`（5 项修复回归＋按预期复现旧漏洞 1 项）和 `pnpm build`；deploy 为 skipped。远端 51 个公开文件与本地上传内容哈希一致。此结果不代表 Supabase 或真实设备已验收。

## 连接Supabase（尚待执行）

1. 用户已授权创建独立 Supabase 免费项目、迁移及 GitHub Pages 发布。控制台已核对没有其他项目，Personal 免费组织 `czechiuu's Org` 已建立；`plans` 项目创建表单已填，等待用户在控制台设置数据库密码并提交，目前还没有 project ref。具体创建/部署进度以 STATUS.md 为准。不复用其他业务库，不自动升级。
2. 确认为新空库后，通过可追踪迁移依次应用 [001 初始迁移](supabase/migrations/202610130001_initial.sql) 和 [002 并发修复](supabase/migrations/202610130002_space_lock_order.sql)，核对迁移历史、RLS 和 RPC 权限。已有库先核实实际结构和已应用版本，只补缺失迁移；不能盲目重跑 001。详见[云端准备与验收](docs/CLOUD-ACCEPTANCE.md)。
3. 保留真实邮箱确认。配置 Auth Site URL 及 Redirect URLs 为实际发布返回的网页地址，包含项目路径；开发时可加实际使用的 `http://127.0.0.1:5173/`。注册/重置回跳保留当前页面路径并去除查询与认证片段；直接使用 `index.html` 时也需精确加入允许列表。默认 SMTP 仅向组织授权邮箱发信且有严格限额，不适合正式使用；需确认可用邮件服务，在 Supabase 安全控制台配置，不能关闭邮箱确认或给测试账号提升组织权限来绕过。真实收信、设置新密码、旧密码失效和新密码登录都必须实测。
4. 控制台API页面取项目URL和publishable公共密钥，填本地`.env.local`或GitHub仓库变量。管理员/secret key不进入本应用前端。
5. 两人分别用自己的账号登录：第一人建空间、私下交邀请令牌；第二人加入时确认昵称和共享范围。默认四个开关全部关闭。
6. 初始私人档案仅在开发机器的`private/`目录，Git忽略且开发服务器禁止下载。各自登录后，在设置页选择本人的JSON，核对后保存；不要上传文件到仓库。代码包没有预设健康资料。
7. 用三个全新、独立、专用合成测试账号运行 `pnpm test:cloud`。读取进程环境的 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY` 和 `TEST_A_EMAIL/PASSWORD`、`TEST_B_EMAIL/PASSWORD`、`TEST_C_EMAIL/PASSWORD` 共 8 项；还需 `TEST_ACCOUNTS_ARE_DISPOSABLE=YES`。通过本机安全环境或 CI Secrets 配置，勿输出值。脚本拒绝已加入空间的账号，只清理本轮创建的测试空间。**不会自动加载 `.env.local`，填好前端配置不等于云测配置齐全。** 缺配置会记录阻塞并非零退出。
8. 按[验收清单](docs/TEST-CHECKLIST.md)完成两个真实设备的持久化、隔离、共享、退出重登和邮件测试。真实数据先别导入未验收后台。

若选择忽略的本机文件 `.env.cloud-test` 安全填写测试环境，可显式加载（Node.js 22+）：

```sh
node --env-file=.env.cloud-test scripts/verify-cloud.mjs
# 还需 E2E_BASE_URL：实际 HTTPS 部署地址，或本地 production preview 地址
node --env-file=.env.cloud-test scripts/verify-cloud-browser.mjs
```

真实浏览器测试拒绝 Vite 开发页，核对生产资源与预期 Supabase 项目。邮件、邀请过期、物理删除计数和两台真实设备另按云端清单记录；两个浏览器上下文或手机尺寸模拟不算两台设备。云测中的私有证据在 `test-results/private/`，不得提交。所有报告中的阻塞/未执行都不能记成通过。

## GitHub部署（尚待执行）

本目录应作为独立仓库根目录，不能上传父目录的科研项目。

1. 用户已指定公开代码仓库 [czechiuu/plans](https://github.com/czechiuu/plans)，源码已上传至上述提交，网页尚未发布。仅上传代码、文档、合成测试和截图；排除`private/`、`.env*`（除空白example）、`node_modules/`、`dist/`、运行日志。健康数据库仍需独立私有权限，不改变账号或仓库安全设置。
2. GitHub仓库Settings → Secrets and variables → Actions → Variables设置两个`VITE_`公共配置。
3. 此公开代码仓库可使用GitHub Pages，不需要升级或更改可见性；代码仓库链接不等于已上线网址。
4. Settings → Pages选择GitHub Actions。源码推送只测试和构建；配置完成后在Actions中手动运行“Test and publish frontend”工作流，才会先验证公共配置，再发布`dist/`。本地构建允许未配置说明屏，手动部署流程拒绝缺配置。
5. 回填Supabase实际网页地址，验证HTTPS和路径下资源加载、两台手机访问。源代码上传不等于部署；部署成功也不等于后端验收。

后续定时任务在Supabase服务端，使用上海20:00对应UTC12:00；不采用浏览器计时器或GitHub工作流冒充准时后台任务。

## 文档和隐私

- [架构/费用](docs/ARCHITECTURE.md)
- [需求/阶段](docs/REQUIREMENTS.md)
- [数据结构/权限/删除边界](docs/DATA-MODEL.md)
- [测试清单/结果](docs/TEST-CHECKLIST.md)
- [云端配置、邮件与双设备验收步骤](docs/CLOUD-ACCEPTANCE.md)
- [开发规则](AGENTS.md)
- [持续状态](STATUS.md)

当前AI供应商未选择、零AI调用，不收泛化AI同意。后续每位用户需明确同意具体供应商、发送资料、用途与保存政策。照片将使用私有授权下载，第一阶段没有图片上传路径。

清除/退出不删除Auth账号；云服务备份可能保留历史直到其实际保留期结束，不宣称立即删除所有备份。详情见数据结构说明。健康信息不写前端缓存或日志，Auth会话由SDK管理；共享范围以服务端权限为准。
