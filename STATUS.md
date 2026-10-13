# 项目状态

更新时间：2026-10-13（Asia/Shanghai）。使用 ponytail、sites:sites、plugin-management。

## 当前结论

第一阶段源码已上传并通过远端 Linux CI，正在准备云端验收。用户已确认 **尚未创建 Supabase 项目**；未配置云端、未部署网页、未执行真实邮件或两台物理设备验收。不能标为正式可用，不能导入两人的真实健康资料。第二阶段及 AI、照片、20:00 自动生成均未开始。

代码仓库：[czechiuu/plans](https://github.com/czechiuu/plans)。仓库地址不代表网站已发布。

## 本轮版本核对

- 审查基线和本轮开始时的远端 main 为 `7a9fe5ec329235dfb88e65bfeb2f2f69b5afc4ea`；这是修复前的历史基线。
- 当前远端源码提交为 `c03df47c5b44c2fe5a2bb4c7459234a239b63cfe`，父提交为 `7a9fe5ec329235dfb88e65bfeb2f2f69b5afc4ea`。远端 51 个公开文件与本地上传内容的 Git blob hash 全部一致。
- 网站目录不是独立 Git checkout，父工作区无提交、无远端；使用逐文件比对保留现有内容。未新建分支或 worktree，未改科研计划。

## 修复与验证进展

| 分类 | 通过 | 失败 | 未执行/阻塞 | 证据与边界 |
|---|---:|---:|---:|---|
| 密码回跳专项 | 7 | 0 | 0 | 旧逻辑 2 通过、5 失败；真实邮件仍未测 |
| 完整本地单元/单连接数据库 | 23 | 0 | 0 | [独立报告](test-results/unit-results.json)，包含上面的 7 项回跳测试，不重复计数 |
| 真实 PostgreSQL 多连接并发 | 5 | 0 | 0 | [独立报告](test-results/concurrency-results.json)，另成功复现 001 漏洞 1 项 |
| 未配置浏览器 | 2 | 0 | 0 | [独立报告](test-results/unconfigured-results.json) |
| 模拟接口界面 | 5 | 0 | 0 | [独立报告](test-results/ui-mock-results.json)，全部合成资料 |
| 真实 Supabase API | 0 | 0 | 11 | [阻塞报告](test-results/cloud-api-results.json)，项目/账号未配置 |
| 真实构建页面＋Supabase | 0 | 0 | 7 | [阻塞报告](test-results/cloud-browser-results.json)，没有替换 API |
| 真实设备 | 0 | 0 | 1 组双设备流程 | 手机尺寸与浏览器上下文不算两台设备 |

`pnpm build` 已通过，产物显示未配置说明。未运行真实注册收信、密码邮件、新密码登录、过期邀请云测及物理删除计数。缺配置脚本非零退出只是阻塞检测，不算云端通过。

远端 [GitHub Actions Linux 运行 38361905537](https://github.com/czechiuu/plans/actions/runs/38361905537) 已通过安装、`pnpm test`（23 通过）、`pnpm test:concurrency`（5 项并发回归通过，并按预期复现 001 基线漏洞 1 项）和 `pnpm build`。该工作流的 deploy 步骤为 **skipped**；这是源码测试与构建证据，不是网页部署或云端验收。

密码恢复与注册确认共用实际页面 URL，保留路径、去掉查询和认证片段，未硬编码 `/plans/`。Vite 保持相对资源路径 `base: './'`。

新增 `202610130002_space_lock_order.sql`，保留历史 001：邀请和退出在空间锁内重新验证身份；加入先锁空间再锁邀请，锁内重检邀请、容量与过期时间。等待旧空间的退出请求不能误清新空间。

真实 PostgreSQL 17 回归以不同连接模拟退出持锁、邀请等待、退出提交；通过 `pg_stat_activity` 的 Lock 和 `pg_blocking_pids` 确认等待后才提交。原 001 确实让退出者生成邀请并被新人使用；002 阻止该行为。另覆盖同令牌竞争、满员竞争、加入/退出反向锁顺序和重复退出。测试客户端使用无 superuser/BYPASSRLS 的 authenticated 角色，RLS 开启；管理员只初始化独立合成库和观察锁。Windows 中文路径限制通过明确的英文临时运行目录解决，未替换成模拟；Linux 运行已由上述 GitHub Actions 验证通过。

浏览器测试已拆分为未配置、模拟界面、真实云端构建页面三类，分别运行与报告；原混合脚本及报告已移除。真实 API 脚本另行报告。公开报告只含用例编号和状态；私有证据位于忽略目录 `test-results/private/`。

## 下一步需要用户操作或确认

1. 用户已授权免费项目创建、001＋002 迁移及 GitHub Pages 发布，并已登录 Supabase。控制台核对原账号没有组织/项目，已创建 Personal 免费组织 `czechiuu's Org`；`plans` 项目创建表单已填，等待用户在控制台直接设置数据库密码并提交。项目尚未创建成功，也没有 project ref；已有授权不再重复询问。
2. 安全配置两个前端公共变量；准备三个全新、专用、可清理的合成测试账号及可用邮件渠道。前端配置与云测进程环境分开，密码/SMTP/私钥不得贴聊天。
3. 公共配置齐全后执行已获授权的 GitHub Pages 发布。使用实际返回的 HTTPS 地址配置 Site URL、Redirect URLs 并检查项目子路径资源。
4. 执行真实 API/页面测试、邮件完整流程、删除后数据库计数和两台真实设备验收。具体操作与证据表见 [云端验收清单](docs/CLOUD-ACCEPTANCE.md)。

跨设备需手动刷新。清除健康数据/退出空间不删除 Auth 账号；云端备份保留规则尚未核实。未接入手机推送或外部 AI，未付费。

## 本轮修改文件

新增或修改（包含合成测试证据）：

```
.github/workflows/pages.yml
AGENTS.md
CONTEXT.md
docs/CLOUD-ACCEPTANCE.md
docs/DATA-MODEL.md
docs/TEST-CHECKLIST.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
README.md
scripts/test-helpers/browser.mjs
scripts/test-helpers/cloud.mjs
scripts/test-helpers/report.mjs
scripts/verify-cloud-browser.mjs
scripts/verify-cloud.mjs
scripts/verify-concurrency.mjs
scripts/verify-ui-mock.mjs
scripts/verify-unconfigured.mjs
scripts/with-local-postgres.mjs
src/api.js
src/auth-redirect.js
STATUS.md
supabase/migrations/202610130002_space_lock_order.sql
test-results/cloud-api-results.json
test-results/cloud-browser-results.json
test-results/cloud-manual-gates.json
test-results/concurrency-results.json
test-results/mobile-dashboard-synthetic.png
test-results/mobile-weight-synthetic.png
test-results/ui-mock-results.json
test-results/unconfigured-results.json
test-results/unit-results.json
tests/auth-redirect.test.js
tests/database.test.js
tests/persistence.test.js
```

删除旧混合入口和报告：`scripts/verify-browser.mjs`、`test-results/browser-results.json`。

