# 第一阶段验收清单与证据

截至 2026-10-13（Asia/Shanghai）。通过=实际执行成功；阻塞/未运行=没有功能验收证据；模拟=仅合成界面。各环境分别统计，不把结构、匿名、模拟、本地或部署通过合并成三账号业务通过。

| 环境/项目 | 通过 | 失败 | 阻塞 | 证据与实际范围 |
|---|---:|---:|---:|---|
| 本地单元、PGlite/合成 Auth | 23 | 0 | 0 | [unit-results.json](../test-results/unit-results.json)，已含 7 项邮件回跳单测 |
| 本地 PostgreSQL 多连接 | 5 | 0 | 0 | [concurrency-results.json](../test-results/concurrency-results.json)，另按预期复现 001 旧漏洞 1 项 |
| 未配置页浏览器 | 2 | 0 | 0 | [unconfigured-results.json](../test-results/unconfigured-results.json)，在单独显式清空 `VITE_` 的 dev 进程检查 |
| 合成资料/内存 API 界面 | 5 | 0 | 0 | [ui-mock-results.json](../test-results/ui-mock-results.json)，只此类替换 API，截图带模拟水印 |
| 云项目空库、001＋002、结构/ACL | 14 | 0 | 0 | [cloud-setup-results.json](../test-results/cloud-setup-results.json)；空库核对、事务迁移和与仓库一致的 LF 源 SQL 迁移历史 |
| 真实云端匿名访问拒绝 | 8 | 0 | 0 | [cloud-anonymous-results.json](../test-results/cloud-anonymous-results.json)：7 张表和 `current_space_id`；没有已登录账号 |
| 首次部署匿名网页 | 8 | 1 | 3 项未运行 | [deployment-results.json](../test-results/deployment-results.json)：唯一失败为 `/favicon.ico` 404，代码已修、构建通过，待重新部署及复测；3 项需账号或真机 |
| 真实三账号 Supabase API | 0 | 0 | 11 | [cloud-api-results.json](../test-results/cloud-api-results.json)，已带项目公共配置重跑；缺 A/B/C 账号凭据和一次性测试确认标志 |
| 真实构建页面＋Supabase | 0 | 0 | 7 | [cloud-browser-results.json](../test-results/cloud-browser-results.json)，已带项目公共配置和网页地址重跑；缺 A/B/C 账号凭据和一次性测试确认标志，不替换 API |
| 真实邮件和两台物理设备 | 0 | 0 | 待做 | [云端](CLOUD-ACCEPTANCE.md)与[真机](DEVICE-ACCEPTANCE.md)清单 |

[GitHub Pages 部署运行 38375922987](https://github.com/czechiuu/plans/actions/runs/38375922987) 的 test-build、deploy 均成功；实际地址为 [https://czechiuu.github.io/plans/](https://czechiuu.github.io/plans/)，源码 `605c8dad48cef31cbffa72d7056016dd0910f596`。首次部署检查的页面错误为图标 404，修复和复测尚未完成；上述 8 项匿名 API 拒绝不能替代三账号共享/隔离检查。Site URL 和两条精确 Redirect URL 已保存并回读，Custom SMTP 关闭，见 [Auth 配置回读](../test-results/cloud-auth-config-results.json)。

本机 `.env.local` 已有两项 `VITE_` 公共配置且被 Git 忽略；新克隆须复制空白 `.env.example` 自行配置。再测“未配置页”须用 [README 命令](../README.md#本地运行与配置)启动另一个显式保留两项空值的 Vite 子进程；旧版 PowerShell 中设置空环境变量可能被当作删除，直接沿用已配置服务会使检查失真。模拟界面始终标“模拟”。云 API/云页面脚本只读进程环境，不自动加载 `.env.local`；真实页面需部署 URL 或已配置 production preview，不能用 dev 页。当前阻塞报告已带项目公共配置重跑，不能当作通过。

## 原始 14 项需求的当前状态

| # | 用户要求 | 当前结论 |
|---|---|---|
| 1 | 双人真实账号、双设备共享与持久化 | 真机/业务云测未运行 |
| 2 | 匿名、第三账号、越权与照片权限 | 匿名 8 项真实云端拒绝通过；三账号未运行；照片未实现 |
| 3 | 自然语言人物、相对日期和歧义确认 | 上海日期本地测试通过；自然语言未实现 |
| 4 | 浏览器关闭后的 20:00 任务与跨午夜 | 未实现、未运行 |
| 5 | 自动生成的并发、防重、失败重试与锁定 | 未实现；邀请并发测试不能替代 |
| 6 | 日程更新使旧计划待更新并保留版本 | 日程编辑冲突本地通过；自动计划版本未实现 |
| 7 | 自由日、器械与寝室替代 | 计划规则未实现 |
| 8 | 热身、动作、休息总时长 | 未实现 |
| 9 | 动画合法、准确、可播放及文字替代 | 未实现、未人工核验 |
| 10 | 食物估算草稿、确认、修正和不重复计数 | 未实现 |
| 11 | 体重真实记录、缺失与少量样本 | 本地计算及模拟界面通过；三账号云端/真机未运行 |
| 12 | 手机日程→计划→动画→记录全流程 | 第一阶段界面模拟通过；完整流程未实现 |
| 13 | 前端、仓库、运行日志不泄漏 | 公共配置和本地私有路径已查；首次部署检查的公开资源与页面无私有资料发现，图标修复待重新部署复测；真实账号运行日志未验收 |
| 14 | 区分通过、失败、阻塞和模拟 | 本表分别报告；自动生成不可标通过 |

真实邮箱确认/重置、A/B/C 权限与撤销、清除后的管理员计数以及双物理设备流程通过前，第一阶段仍非正式可用。私人健康档案不导入，第二阶段不开始。
