# 健康功能部署与后续验收：006–009

截至 2026-10-14，生产已执行 001–009；009 输入快照另行部署并回读，旧任务不回填。三函数下载源码与本轮 bundle 匹配，Pages 已发布 main `eea81bb3e82d3b1083285620c1400cbde00a4d43`。摘要和能力回读见[发布记录](../test-results/daily-flow-release.json)，线上匿名页面检查见[8 项报告](../test-results/deployed-public-results.json)。以下 1–5 为已执行部署步骤的核对记录，勿重跑迁移、重置数据或清除两条旧 exhausted 任务。

1. 核对备份及现有迁移历史。运行 `node scripts/prepare-daily-flow-migrations.mjs` 后审核 [006–008 执行包](../supabase/admin/apply-daily-flow-006-008.sql)。包按序执行新迁移并登记，前置历史或源摘要不符时停止；不能把粘贴成功当成验收。执行后回读迁移内容、版本 RPC、权限和默认开关，保留失败报告。
2. 运行 `pnpm build:edge`，将三份新 bundle 分别部署为 `health-ai`、`health-photo`、`health-cron`。继续使用原项目 `wnzbtitlvteptkvwhavw`。三函数网关 `verify_jwt=false`；AI/照片函数内验证真实用户令牌及固定身份，cron 验证服务端密钥。不得以关闭网关为由跳过函数内鉴权。
3. 沿用精确来源 `HEALTH_ALLOWED_ORIGINS=https://czechiuu.github.io`；本地调试只加入实际需要的确切 origin。Secrets/Vault 仅在安全界面配置，不输出到日志、SQL 文件或前端。继续核对 Vault 与 Edge 调度密钥一致；不需要为此更换已有密钥。
4. 原每五分钟调度按最近上海 20:00 锚点入队，延迟跨午夜仍保留原目标日。006 固定任务 provider，两人独立完成、有限重试；手动锁、更新输入及实际记录不能被旧任务覆盖。HTTP 成功不证明计划发布，须回读各人任务与计划。
5. 新版前端已通过[手动发布工作流](https://github.com/czechiuu/plans/actions/runs/38522121912)发布，测试构建与部署两个任务成功，来源为 `eea81bb`，并核对公开资源。普通 push 的 CI 构建本身不等于 Pages 发布；真人健康业务仍需单独验收。

## 已执行的管理员开通与待做的本人授权

用户已批准管理员启用 DeepSeek，且本轮合成验收最多 5 美分，不增加原预算。007 迁移初始值是 `health_enabled=false`，管理员已另行明确开通并回读；开启时本人用途同意为 0 条。两人仍须分别登录并同意各用途，图片独立，不能由管理员替代本人授权。

保持全站 200 美分、OpenAI 200 美分、DeepSeek 10 美分月度上限；启用时 DeepSeek 已用 5 美分、活动预留 0。不要重跑旧预算脚本提高较小额度。本轮四次付费调用各按最多 2 美分核对，剩余 5 美分不保证全部完成；不足时停止并报告，不自动加预算。

在交互终端运行 `node scripts/run-fixed-cloud-tests.mjs --daily-flow`，通过隐藏输入登录；显式设置 `TEST_DAILY_FLOW_APPROVED=YES` 与付费许可 `TEST_DAILY_FLOW_DEEPSEEK_APPROVED=YES`。两个旧任务仅按 `TEST_DAILY_FLOW_BASELINE_JOB_IDS` 的精确审核名单只读保留，其他健康输入必须为空或属本轮精确 ID。运行器不替本人同意，不改既有私人档案；无法安全清理的本轮记录生成精确清单交管理员审核。

## 发布后验收

依次核对匿名拒绝、两账号保存刷新和隔离、照片上传及撤销/删除、rules 重试零 AI、已确认日程→计划→图片估算→确认餐食→餐后建议应用与撤销、活动记录与恢复限制。另行实际等待 20:00，确认两人目标日和独立发布；再用两台物理设备验收。未跑项保留未运行，模拟不替代真实服务。

真实档案由本人登录导入并核对，公共文档不记录档案数值。照片删除失败中止清除并允许重试；收到成功前不能宣称完成。本站删除与外部供应商/备份保存边界分别说明。
