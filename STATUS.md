# 项目状态

更新于 2026-10-14（上海时间）。源码、已发布网站、数据库和真实使用分别验收。

当前 [实际网站](https://czechiuu.github.io/plans/) 仍运行固定双账号基础版 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`（[部署记录](https://github.com/czechiuu/plans/actions/runs/38393501421)）。应用源码提交 `b1654ddf574a266825a425f23ba00d61c262509a` 已推送，[push CI](https://github.com/czechiuu/plans/actions/runs/38422347145) 成功，但**尚未发布这版前端**；源码通过测试不等于网站已更新。

原 Supabase 项目已在 SQL Editor 执行 004 健康迁移。原有 3 张健康表仍为空，固定账号仍为 2 个；9 张新表的 RLS、私人照片 bucket、默认私有、无 AI 授权及匿名/普通客户端拒绝等结构检查 9/0。历史登记首次因粘贴的 CRLF 与原文不符而失败；严格限定为换行差异的修复后，回读 004 原文 MD5 `9a430516e9a44d8d27c651cf24e73e2b`、67968 字节，最终历史检查 1/0，总计 **10/0**。[生产 004 回读记录](test-results/cloud-health-deployment.json)保留了首次失败。没有重跑 001–003，也没有导入真实健康档案。

005 的服务商分用途授权、预算与 DeepSeek 合成探针已写源码（源 MD5 `2c57e2948216f3e08e2170754e1fd883`），**尚未在云端执行**。后台已核实存在 `DEEPSEEK_API_KEY` 和 `HEALTH_CRON_SECRET` 两个 secret 名称，没有读取其值。用户已允许本轮 DeepSeek **仅合成测试最多 10 美分**，并共用原先同意的全站每月 2 美元上限；独立预算和真实调用仍待部署、核对。三个 Edge Function 正在发布，尚未确认成功；Cron 也未部署或验收。DeepSeek 不接收个人健康资料。

| 验证环境 | 通过/失败 | 边界 |
|---|---:|---|
| 本地 `node --test` 全套 | 61/0 | 最终全套；后续受影响项再验 8/0，未把沙箱中的 `pnpm` EPERM 当作通过 |
| 隔离 PostgreSQL 的 004 包 | 12/0 | [报告](test-results/health-migration-wrapper-results.json)，不是云端执行 |
| 隔离 PostgreSQL 的 005 权限/预算并发 | 5/0 | [报告](test-results/ai-provider-concurrency-results.json)，无付费调用 |
| 合成浏览器界面 | 18/0 | [报告](test-results/ui-mock-results.json)，不触生产账号 |
| 未配置页面 / 动作逐项核对 | 2/0、11/0 | [页面报告](test-results/unconfigured-results.json)、[动作来源](docs/EXERCISE-SOURCES.md) |
| 生产 004 结构与历史 | 10/0 | [回读记录](test-results/cloud-health-deployment.json)；不代替业务/API 验收 |

旧版真实 API [11/0](test-results/cloud-api-results.json)、旧版浏览器 [9/1](test-results/cloud-browser-results.json)是历史记录，不能算新源码通过。新版真实双账号健康读写、照片、AI、20:00 定时和两台物理设备均未通过；前端和函数部署后还需单独验收。手动记录默认私有；另一设备需手动刷新，站内提示不是手机推送。完整步骤见[测试清单](docs/TEST-CHECKLIST.md)和[部署说明](docs/HEALTH-DEPLOY.md)。
