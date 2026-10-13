# 项目状态

更新于 2026-10-14（上海时间）。源码、已发布网站、数据库和真实使用分别验收。

新版 `b55346a6001ff21ff91f70d4e6e76dd607b2625a` 已发布到[实际网站](https://czechiuu.github.io/plans/)；[push CI](https://github.com/czechiuu/plans/actions/runs/38429761363)和[手动发布的 test-build、deploy](https://github.com/czechiuu/plans/actions/runs/38430307904)均成功。公开页面实际冒烟 **8/0**，覆盖 HTTPS、`/plans/` 静态资源、手机/桌面、刷新和合成回跳地址；[报告](test-results/deployed-public-results.json)、[手机截图](test-results/public-mobile-login.png)、[桌面截图](test-results/public-desktop-login.png)。未输入真实密码，不算登录或健康功能验收。

原 Supabase 项目已在 SQL Editor 执行 004 健康迁移。原有 3 张健康表仍为空，固定账号仍为 2 个；9 张新表的 RLS、私人照片 bucket、默认私有、无 AI 授权及匿名/普通客户端拒绝等结构检查 9/0。历史登记首次因粘贴的 CRLF 与原文不符而失败；严格限定为换行差异的修复后，回读 004 原文 MD5 `9a430516e9a44d8d27c651cf24e73e2b`、67968 字节，最终历史检查 1/0，总计 **10/0**。[生产 004 回读记录](test-results/cloud-health-deployment.json)保留了首次失败。没有重跑 001–003，也没有导入真实健康档案。

005 服务商分用途授权迁移已在原项目执行，7 项配置回查通过；源 MD5 `2c57e2948216f3e08e2170754e1fd883`。本月预算上限为全站 200 美分、OpenAI 200 美分、DeepSeek 固定合成探针 10 美分。UUID 校验修复源码为 `69006400aee6f603073579ae5bfb9af9896070e1`，[CI](https://github.com/czechiuu/plans/actions/runs/38442975458)成功；`health-ai` 与 `health-cron` 两个修复包已部署，前端和 `health-photo` 仍为 `b55346a`。本地定向 6/0（[报告](test-results/cron-uuid-local-results.json)），公开 Edge 边界重新 14/0；这些均不代替登录验证。

DeepSeek 固定合成探针 id=14 中食物文字、苹果香蕉图片、休息模板计划通过，日程解析失败；单项 id=19 日程复测 1/0，身份、日期、起止时间、时长五项与 schema 均核对为 true。最新各项覆盖 4/0，历史一次失败保留为五次响应共 4/1。SQL 合计 settled 5 美分/10 美分限额、reserved=0；账户余额差额 0 不能说明免费。真实健康资料仍禁止发送给 DeepSeek，夜间服务默认未切换。

Vault 与 Edge 调度密钥核对四项均通过。`*/5 * * * *` 调度已配置，按最近上海 20:00 锚点派发；早期 HTTP 401 和 UUID 校验拒绝保留为历史。18:06 UTC 的 dispatch id=20 返回 HTTP 503，failure 为 `MEAL_TEMPLATE_UNCONFIRMED`、count=2；两项 job 已实际领取并标为 failed、attempts=1。锚点 `2026-10-13T12:00Z` 的目标为 2026-10-14，跨午夜日期正确。两人尚未确认餐食模板，因此没有生成计划；需本人在设置确认餐食模板及训练条件，但新版真实权限验收前不导入原始真实档案。HTTP 响应或成功入队均不等于计划已生成；真实 20:00 自动执行仍未验收。

| 验证环境 | 通过/失败 | 边界 |
|---|---:|---|
| 本地 `node --test` | 先前全套 61/0 | 随后受影响项 8/0、探针定向 3/0、UUID/cron 定向 6/0；未合并计数，也未把沙箱中的 `pnpm` EPERM 当作通过 |
| 隔离 PostgreSQL 的 004 包 | 12/0 | [报告](test-results/health-migration-wrapper-results.json)，不是云端执行 |
| 隔离 PostgreSQL 的 005 权限/预算并发 | 5/0 | [报告](test-results/ai-provider-concurrency-results.json)，无付费调用 |
| 合成浏览器界面 | 18/0 | [报告](test-results/ui-mock-results.json)，不触生产账号 |
| 未配置页面 / 动作逐项核对 | 2/0、11/0 | [页面报告](test-results/unconfigured-results.json)、[动作来源](docs/EXERCISE-SOURCES.md) |
| 生产 004 结构与历史 | 10/0 | [回读记录](test-results/cloud-health-deployment.json)；不代替业务/API 验收 |
| 生产 005 配置回查 | 7/0 | 迁移、预算与服务商边界已核对；不代替真实账号调用 |
| 公开 Edge 边界 / 新版公开网页 | 重新 14/0、此前 8/0 | [Edge 报告](test-results/edge-public-results.json)、[页面报告](test-results/deployed-public-results.json)，均未登录 |
| DeepSeek 固定合成探针 | 最新覆盖 4/0；历史合计 4/1 | 日程 id=19 复测通过，id=14 一次失败保留；五条 SQL settled、计费记录 5/10 美分；不涉及真实健康资料 |
| cron 真实领取与计划 | 领取 2、生成 0 | 两项因未确认餐食模板失败、attempts=1；真实 20:00 未验收 |

旧版真实 API [11/0](test-results/cloud-api-results.json)、旧版浏览器 [9/1](test-results/cloud-browser-results.json)是历史记录，不能算新源码通过。新版真实双账号健康读写、照片、完整 AI、实际 20:00 和两台物理设备仍未验收；公开边界与登录页测试不能代替它们。手动记录默认私有；另一设备需手动刷新，站内提示不是手机推送。完整步骤见[测试清单](docs/TEST-CHECKLIST.md)和[部署说明](docs/HEALTH-DEPLOY.md)。
