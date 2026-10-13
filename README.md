# 两个人的日常

私人双人饮食与运动管理网站。中文、手机优先、日期统一Asia/Shanghai。**目前第一阶段本地代码已实现，云端尚未配置，不能宣称正式可用。** 当前完整进度、证据与待解决事项见 [STATUS.md](STATUS.md)。

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
pnpm build
# 浏览器检查须先运行pnpm dev；Windows默认使用已有Chrome无头实例
pnpm test:browser
# macOS/Linux没有浏览器时按Playwright官方方法配置，或指定TEST_BROWSER_PATH
```

浏览器脚本部分测试使用仅在测试路由中注入的内存模拟接口，截图有水印，生产应用不导入测试fixture。不能用此结果替代云端验证。`pnpm test`使用真实本地Postgres引擎PGlite，Auth角色来自合成fixture；不验证Supabase Auth/邮件/真实手机。

## 连接Supabase（尚待执行）

1. 在本人Supabase控制台新建免费项目，选择适合两台手机访问的区域。本项目只需一个项目；不自动升级。
2. 在该新项目SQL Editor执行 [初始迁移](supabase/migrations/202610130001_initial.sql)。这是为新项目编写的迁移，不向已有业务表盲目应用；运行失败需查原因，不忽略错误。
3. 保留真实邮箱确认。配置Auth Site URL及Redirect URLs为实际网页地址（包含GitHub仓库路径），开发时可加`http://127.0.0.1:5173/`；不更改操作系统时区。确认邮件和密码重置必须实际验证；默认邮件有限制，必要时在控制台安全配置SMTP或管理员邀请两位用户，不能以关闭确认代替测试。
4. 控制台API页面取项目URL和publishable公共密钥，填本地`.env.local`或GitHub仓库变量。管理员/secret key不进入本应用前端。
5. 两人分别用自己的账号登录：第一人建空间、私下交邀请令牌；第二人加入时确认昵称和共享范围。默认四个开关全部关闭。
6. 初始私人档案仅在开发机器的`private/`目录，Git忽略且开发服务器禁止下载。各自登录后，在设置页选择本人的JSON，核对后保存；不要上传文件到仓库。代码包没有预设健康资料。
7. 用三个全新、独立、专用合成测试账号运行`pnpm test:cloud`。环境变量是`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`和`TEST_A_EMAIL/PASSWORD`、`TEST_B_EMAIL/PASSWORD`、`TEST_C_EMAIL/PASSWORD`。通过本机安全环境或CI Secrets设置，勿输出值。脚本拒绝已加入空间的账号，只写合成资料并清理自己的测试空间；缺配置非零退出，不算通过。
8. 按[验收清单](docs/TEST-CHECKLIST.md)完成两个真实设备的持久化、隔离、共享、退出重登和邮件测试。真实数据先别导入未验收后台。

## GitHub部署（尚待执行）

本目录应作为独立仓库根目录，不能上传父目录的科研项目。

1. 用户已指定公开代码仓库 [czechiuu/plans](https://github.com/czechiuu/plans)。仅上传代码、文档、合成测试和截图；排除`private/`、`.env*`（除空白example）、`node_modules/`、`dist/`、运行日志。健康数据库仍需独立私有权限，不改变账号或仓库安全设置。
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
- [开发规则](AGENTS.md)
- [持续状态](STATUS.md)

当前AI供应商未选择、零AI调用，不收泛化AI同意。后续每位用户需明确同意具体供应商、发送资料、用途与保存政策。照片将使用私有授权下载，第一阶段没有图片上传路径。

清除/退出不删除Auth账号；云服务备份可能保留历史直到其实际保留期结束，不宣称立即删除所有备份。详情见数据结构说明。健康信息不写前端缓存或日志，Auth会话由SDK管理；共享范围以服务端权限为准。
