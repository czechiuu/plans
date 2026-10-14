# 健康功能部署与后续验收：006–009

截至 2026-10-14，生产已执行 001–009；009 输入快照另行部署并回读，旧任务不回填。三函数下载源码与后端 `eea81bb` 的 bundle 匹配；Pages 已发布三个 GIF / 八视频前端 `da20689ebe98e4815fbe0cf5b402f4d401e2fa40`，[push 持续集成](https://github.com/czechiuu/plans/actions/runs/38545425365) 136 项通过、0 失败，[Pages 部署](https://github.com/czechiuu/plans/actions/runs/38545984882)成功。迁移和函数摘要见[发布记录](../test-results/daily-flow-release.json)。以下 1–5 为已执行部署步骤的核对记录，勿重跑迁移、重置数据或清除两条旧 exhausted 任务。

1. 核对备份及现有迁移历史。运行 `node scripts/prepare-daily-flow-migrations.mjs` 后审核 [006–008 执行包](../supabase/admin/apply-daily-flow-006-008.sql)。包按序执行新迁移并登记，前置历史或源摘要不符时停止；不能把粘贴成功当成验收。执行后回读迁移内容、版本 RPC、权限和默认开关，保留失败报告。
2. 运行 `pnpm build:edge`，将三份新 bundle 分别部署为 `health-ai`、`health-photo`、`health-cron`。继续使用原项目 `wnzbtitlvteptkvwhavw`。三函数网关 `verify_jwt=false`；AI/照片函数内验证真实用户令牌及固定身份，cron 验证服务端密钥。不得以关闭网关为由跳过函数内鉴权。
3. 沿用精确来源 `HEALTH_ALLOWED_ORIGINS=https://czechiuu.github.io`；本地调试只加入实际需要的确切 origin。Secrets/Vault 仅在安全界面配置，不输出到日志、SQL 文件或前端。继续核对 Vault 与 Edge 调度密钥一致；不需要为此更换已有密钥。
4. 原每五分钟调度按最近上海 20:00 锚点入队，延迟跨午夜仍保留原目标日。006 固定任务 provider，两人独立完成、有限重试；手动锁、更新输入及实际记录不能被旧任务覆盖。HTTP 成功不证明计划发布，须回读各人任务与计划。
5. 三 GIF / 八视频版前端已通过[手动发布工作流](https://github.com/czechiuu/plans/actions/runs/38545984882)发布，测试构建与部署成功，来源为 `da20689`；[新版匿名页面](../test-results/deployed-public-results.json) 8/0 且线上与 dist 资源 SHA 匹配。三个 GIF 已在实际线上 IAB 定向显示与收起；最终整轮网页 6/1，原失败保留，不再重跑。普通 push 的 CI 构建本身不等于 Pages 发布；真实 API 与网页另行验收。

## 已执行的管理员开通与本人授权边界

用户已批准管理员启用 DeepSeek，且本轮合成验收最多 5 美分，不增加原预算。007 迁移初始值是 `health_enabled=false`，管理员已另行明确开通并回读；两人本人用途同意分别控制，图片独立，不能由管理员替代。真实策略验收已核对撤销、个人预算阻断及恢复，验收前授权状态已恢复。

保持全站 200 美分、OpenAI 200 美分、DeepSeek 10 美分月度上限；原探针结算 5 美分，本轮四次正式合成调用各结算 1 美分、合计 4 美分，无活动预留。不要重跑旧预算脚本提高较小额度；不足时停止并报告，不自动加预算。

在交互终端运行 `node scripts/run-fixed-cloud-tests.mjs --daily-flow`，通过隐藏输入登录；显式设置 `TEST_DAILY_FLOW_APPROVED=YES` 与付费许可 `TEST_DAILY_FLOW_DEEPSEEK_APPROVED=YES`。两个旧任务仅按 `TEST_DAILY_FLOW_BASELINE_JOB_IDS` 的精确审核名单只读保留，其他健康输入必须为空或属本轮精确 ID。运行器不替本人同意，不改既有私人档案；无法安全清理的本轮记录生成精确清单交管理员审核。

## 发布后验收与清理

真实双账号合成 API 已完成 [10/0](../test-results/daily-flow-cloud-results.json)：规则后台实际领取、日程→计划→图片估算→确认餐食→餐后建议应用与撤销、活动读回。授权撤销、个人预算阻断与恢复另有[真实 3/0](../test-results/cloud-health-policy-results.json)，无新增费用。当前 `da20689` 的[实际线上媒体核验](../test-results/exercise-gif-iab-results.json) 7/0：三个 GIF 显示与收起、有计划时其他动作折叠、八个原视频 href 一致；八段视频未逐个手机播放。[10:12:16 最终整轮网页报告](../test-results/cloud-health-ui-20261014-1812-results.json) 6/1/0：媒体断言抢在GIF加载完成前，独立[真实生命周期](../test-results/frontend-gif-lifecycle-results.json) 3/0 证实最终三图均加载，不改写原失败。10:05 前置轮1/1/5、[09:31旧版](../test-results/cloud-health-ui-20261014-1731-results.json) 5/2/0和[更早](../test-results/cloud-health-ui-20261014-1633-results.json) 6/1/0均保留历史。安全窗口已关闭，不再重试。另行实际等待 20:00，确认两人目标日和独立发布；再用两台物理设备验收。未跑项保留未运行，模拟不代替真实服务。

清理只针对本轮清单中的精确 ID，[来源只读核验](../test-results/cleanup-source-verification-results.json)为 24/0。[最终清理报告](../test-results/final-synthetic-cleanup-results.json)记录：主清理先回滚预演后提交；独立基线计划经原子守卫提交，两者回读通过。精确删除计划6、任务3、调整1、AI缓存4、规则1、创建回执4；目标 owner API 记录、照片 Storage 对象、任务输入快照均剩0，隔离回归7/0。规则仅在 `updated_at` 一致时删除；受保护行整行比较未变，两条旧 exhausted job、计费账本、本人授权及预算设置保留。[预演失败](../test-results/cleanup-preview-20261014-failure.json)、[来源核验失败](../test-results/cleanup-preview-20261014-source-failure.json)保留为历史。首轮 UI 创建回执有1条来源无法证明，因此保留，不按日期或孤儿状态删除；不能称所有测试元数据清空。

真实档案由本人登录导入并核对，公共文档不记录档案数值。照片删除失败中止清除并允许重试；收到成功前不能宣称完成。本站删除与外部供应商/备份保存边界分别说明。
