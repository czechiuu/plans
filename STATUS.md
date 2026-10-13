# 项目状态

更新时间：2026-10-13（Asia/Shanghai）。

## 当前结论

第一阶段免费 Supabase 项目已创建、数据库迁移已应用，前端已发布到 [实际网页](https://czechiuu.github.io/plans/)。**仍未完成真实账号业务权限、邮件和两台物理设备验收，不能导入两人的真实健康资料，也不进入第二阶段。** AI、照片和 20:00 自动计划尚未实现。

项目是 Supabase 免费组织 `czechiuu's Org` 下的 `czechiuu's Project`，ref `wnzbtitlvteptkvwhavw`，区域 ap-south-1 Mumbai、NANO。当前部署的公开源码仍为 `605c8dad48cef31cbffa72d7056016dd0910f596`；本轮新增证据与文档尚待提交，不能虚构新提交号。本轮开始时远端 51 个公开文件与本地上传内容的哈希一致。此前邮件回跳和邀请/退出并发修复已完成，本轮没有重写。

## 已有证据与边界

| 检查 | 结果 | 证据及边界 |
|---|---|---|
| 空库与迁移 | 001、002 顺序提交；14 项结构/ACL 检查通过、0 失败 | [cloud-setup-results.json](test-results/cloud-setup-results.json)。SQL Editor 事务执行，迁移历史保存与仓库一致的 LF 规范化源 SQL；仅证明结构和权限配置 |
| 真实云端匿名拒绝 | 8 通过、0 失败 | [cloud-anonymous-results.json](test-results/cloud-anonymous-results.json)：7 张表及 `current_space_id` 匿名请求被拒；不证明三账号业务 RLS |
| 首次部署匿名网页检查 | 8 通过、1 失败、3 未运行 | [deployment-results.json](test-results/deployment-results.json)：唯一失败为 `/favicon.ico` 返回 404；内联图标已修复、构建通过，重新部署和复测仍待完成。3 项需账号或真机 |
| 本地单元与数据库 | 23 通过、0 失败 | [unit-results.json](test-results/unit-results.json)，PGlite/合成 Auth |
| 本地 PostgreSQL 多连接 | 5 通过、0 失败；旧 001 漏洞按预期复现 1 项 | [concurrency-results.json](test-results/concurrency-results.json) |
| 未配置页／模拟界面 | 2／5 通过、各 0 失败 | [unconfigured-results.json](test-results/unconfigured-results.json)、[ui-mock-results.json](test-results/ui-mock-results.json)；模拟只用合成资料 |
| 三账号真实 Supabase API／真实页面 | 0 通过、0 失败、11／7 项阻塞 | [cloud-api-results.json](test-results/cloud-api-results.json)、[cloud-browser-results.json](test-results/cloud-browser-results.json) 已带项目公共配置和网页地址重跑；现缺 A/B/C 账号凭据及一次性测试账号确认标志 |
| 真实邮件／两台物理设备 | 未运行 | 尚无专用 A/B/C 测试账号和可用邮件渠道；一台设备的两个窗口不算双设备 |

本地 `.env.local` 仅有两项 `VITE_` 公共配置并被 Git 忽略；GitHub Actions 的两项公共 Variables 已保存。GitHub Pages Source 已设为 GitHub Actions、HTTPS 已开启。[手动部署运行 38375922987](https://github.com/czechiuu/plans/actions/runs/38375922987) 于 2026-10-13 09:23:11—09:23:45 UTC 完成，test-build 与 deploy 均 success，网页地址为 [https://czechiuu.github.io/plans/](https://czechiuu.github.io/plans/)。首次部署检查发现图标 404，修复后仍需复测；网页发布不等于业务云测通过。

Auth Site URL 已保存为实际网页地址；Redirect URLs 已保存并回读确认，只有 `/plans/` 与 `/plans/index.html` 两条精确网址，没有宽泛通配。[配置回读报告](test-results/cloud-auth-config-results.json)记录允许注册和邮箱确认开启、匿名登录关闭、Email 启用，这些开关未改。Custom SMTP 当前关闭；用户没有现成 SMTP，已提出个人 QQ 邮箱 SMTP 作为免费候选，待用户选择和配置，实际投递尚未验证。保留邮箱确认，不提升测试邮箱为组织成员绕过限制，也不擅自接入可能收费的服务。

## 接下来

1. 上传已修复的图标代码，重新部署并复测受影响页面。
2. 确定合规邮件渠道，准备三个独立、可清理的合成账号；再运行真实 API 11 项和真实页面 7 项，检查共享、撤销、代改、冲突与退出。真实邮箱/密码/令牌不进仓库或报告。
3. 邮件确认与重置、管理员精确过滤的删除计数、两台物理设备 [5 步验收](docs/DEVICE-ACCEPTANCE.md) 留下实际证据；备份保留规则未核实，保持未知。完成前不导入 `private/` 的真实档案。

跨设备共享变化需手动刷新；没有实时通知。清除健康数据或退出空间不会删除 Auth 账号。详细门槛见 [云端验收清单](docs/CLOUD-ACCEPTANCE.md)。
