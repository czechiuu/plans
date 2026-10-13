# 项目状态

更新于 2026-10-14（上海时间）。源码、已发布网站、数据库和真实使用分别验收。

新版 `b55346a6001ff21ff91f70d4e6e76dd607b2625a` 已发布到[实际网站](https://czechiuu.github.io/plans/)；[push CI](https://github.com/czechiuu/plans/actions/runs/38429761363)和[手动发布的 test-build、deploy](https://github.com/czechiuu/plans/actions/runs/38430307904)均成功。公开页面实际冒烟 **8/0**，覆盖 HTTPS、`/plans/` 静态资源、手机/桌面、刷新和合成回跳地址；[报告](test-results/deployed-public-results.json)、[手机截图](test-results/public-mobile-login.png)、[桌面截图](test-results/public-desktop-login.png)。未输入真实密码，不算登录或健康功能验收。

原 Supabase 项目已在 SQL Editor 执行 004 健康迁移。原有 3 张健康表仍为空，固定账号仍为 2 个；9 张新表的 RLS、私人照片 bucket、默认私有、无 AI 授权及匿名/普通客户端拒绝等结构检查 9/0。历史登记首次因粘贴的 CRLF 与原文不符而失败；严格限定为换行差异的修复后，回读 004 原文 MD5 `9a430516e9a44d8d27c651cf24e73e2b`、67968 字节，最终历史检查 1/0，总计 **10/0**。[生产 004 回读记录](test-results/cloud-health-deployment.json)保留了首次失败。没有重跑 001–003，也没有导入真实健康档案。

005 服务商分用途授权迁移已在原项目执行，7 项配置回查通过；源 MD5 `2c57e2948216f3e08e2170754e1fd883`。本月预算已实际设置：全站 200 美分、OpenAI 200 美分、DeepSeek 固定合成探针 10 美分；这是上限，不是已花费。前端、`health-ai`、`health-photo` 线上仍为 `b55346a`，`health-cron` 新包 `437f341` 已实际部署；网关 JWT gate 关闭，应用自行鉴权，[公开拒绝与预检 14/0](test-results/edge-public-results.json)，不代表已登录权限通过。`*/5 * * * *` 调度已配置，按最近上海 20:00 锚点派发。首个 SQL 合成探针请求（request_id=2）曾返回 HTTP 401 `AUTH_REQUIRED`，未进入 DeepSeek；随后 Vault 与 Edge 密钥核对四项布尔结果均为 true，cron 请求已返回 HTTP 200。请求 id=11 显示 enqueued=2、attempted=2，后续多次为 enqueued=0、attempted=2；截至 17:47 UTC 两项 job 仍 queued、attempts=0，自动生成未通过。真实 DeepSeek 固定合成探针 id=14 有 4 项：食物文字、苹果香蕉图片、休息模板计划通过，日程解析失败，合计 3/1；SQL 四条均 settled，计费记录 4 美分/10 美分限额，账户余额差额为 0，不能据此判断调用免费。已证实 `ai-core` 与 `health-ai` 的 UUID 校验少一个 4 字符段，真实 job_id、meal_id 被拒绝，cron 从未领取 job；后端正在修复两处并补有效 UUID 领取回归与错误计数，AI、cron 新包尚未部署，照片函数不受影响。HTTP 200 不代表计划生成成功。真实健康资料仍禁止发送给 DeepSeek，夜间服务默认未切换。

| 验证环境 | 通过/失败 | 边界 |
|---|---:|---|
| 本地 `node --test` | 先前全套 61/0 | 随后受影响项 8/0、本次合成探针定向 3/0；未合并计数，也未把沙箱中的 `pnpm` EPERM 当作通过 |
| 隔离 PostgreSQL 的 004 包 | 12/0 | [报告](test-results/health-migration-wrapper-results.json)，不是云端执行 |
| 隔离 PostgreSQL 的 005 权限/预算并发 | 5/0 | [报告](test-results/ai-provider-concurrency-results.json)，无付费调用 |
| 合成浏览器界面 | 18/0 | [报告](test-results/ui-mock-results.json)，不触生产账号 |
| 未配置页面 / 动作逐项核对 | 2/0、11/0 | [页面报告](test-results/unconfigured-results.json)、[动作来源](docs/EXERCISE-SOURCES.md) |
| 生产 004 结构与历史 | 10/0 | [回读记录](test-results/cloud-health-deployment.json)；不代替业务/API 验收 |
| 生产 005 配置回查 | 7/0 | 迁移、预算与服务商边界已核对；不代替真实账号调用 |
| 公开 Edge 边界 / 新版公开网页 | 14/0、8/0 | [Edge 报告](test-results/edge-public-results.json)、[页面报告](test-results/deployed-public-results.json)，均未登录 |
| DeepSeek 固定合成探针 | 3/1 | 日程解析失败；四条 SQL 均 settled，计费记录 4/10 美分；不涉及真实健康资料 |

旧版真实 API [11/0](test-results/cloud-api-results.json)、旧版浏览器 [9/1](test-results/cloud-browser-results.json)是历史记录，不能算新源码通过。新版真实双账号健康读写、照片、完整 AI、实际定时和两台物理设备仍未验收；公开 14/0 和 8/0 只证明匿名边界与登录页。手动记录默认私有；另一设备需手动刷新，站内提示不是手机推送。完整步骤见[测试清单](docs/TEST-CHECKLIST.md)和[部署说明](docs/HEALTH-DEPLOY.md)。
