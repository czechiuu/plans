# 数据结构与权限

截至 2026-10-14，生产已应用 001–008；006–008 的迁移摘要及能力回读见[发布记录](../test-results/daily-flow-release.json)。结构部署不等于真人业务验收。旧字段细节见 [HEALTH-API](HEALTH-API.md)，新增契约见 [DAILY-FLOW-CHANGES](DAILY-FLOW-CHANGES.md)，有差异时以迁移源为准。

009 输入快照已在生产应用并回读 MD5 一致：`generation_input_snapshots` 只允许本人读取，按生成任务与输入版本保存来源快照；历史任务不回填，无快照须明确视为不可追溯。前端本人 JSON 导出已接入该表并要求 `health_input_snapshot_schema_version()=9`，版本不符时明确拒绝完整导出，不生成缺项文件。生产能力探针为9；真实生成及导出仍待安全登录验收。

| 实体 | 内容与边界 |
|---|---|
| auth.users / fixed_accounts | 两个指定密码身份及 me/w 槽位；前端不查询对方邮箱 |
| spaces / members | 固定私人空间、类别共享与代改开关；普通客户端不能创建空间或邀请 |
| health_profiles / health_rules | 本人基线、偏好及确认限制；未知字段保留未知，基线不生成测量记录 |
| schedules | 原文、提交时间、解析版本、确认结构与明确时段；每人每日一条 |
| weights | 真实体重及可选腰围/测量时刻，缺失不造点 |
| daily_plans | 按日版本、源输入摘要、source、锁定、current/stale；新发布保留旧版本 |
| generation_jobs | 目标日、原调度锚点、状态、重试与错误；006 原子绑定 provider，重试不变 |
| plan_input_revisions（006） | 手改/锁状态修订，避免目标日自己的自动输出反过来污染源输入摘要 |
| training_sessions | 计划计时及逐组实际记录；008 增加显式 activity_type、record_date、duration_seconds、intensity、pain、notes |
| meals | 草稿/确认状态、食物份量、油酱、剩余及估算区间；只汇总确认摄入 |
| photo_assets | 私有对象、摘要、uploading/deleting 生命周期；上传、清除、退出共享锁序 |
| ai_consents / ai_plan_preferences（005） | 每人每服务商每用途的可撤销同意、未来自动计划服务商 |
| ai_provider_settings（007） | 管理员健康业务开关，初始 DeepSeek 关闭 |
| ai_usage / ai_monthly_budgets / ai_provider_budgets | 最小费用账本、全站与服务商限额；原子预留，不存健康原文 |
| ai_request_results（007） | 服务端私有输入摘要/结果缓存，completed 可复用，未知发送失败不重复付费 |
| meal_adjustments（007） | 原计划、源输入快照/摘要、建议、状态及应用版本，有限重试并保留历史 |
| record_create_requests（008） | 本人 client_request_id 原子创建回执，餐食/活动重复提交不重复入账 |
| audit_events | 实体、动作、所有者、操作者和时间；不放健康原文、数值、照片或密钥 |

Auth、固定槽位、指定空间和当前成员关系共同确认身份。新增默认私有，对方读取同时需要同空间、所有者类别共享和单条共享；代改再需独立许可且不能转移所有权、扩展共享或删对方数据。写 RPC 固定 search_path 并显式授权，RLS 不能由前端展示代替。编辑以 expected_updated_at 检测冲突。

006 的新手动任务接口是 `request_plan_generation(p_target_date,p_provider)`；scheduled 任务从已保存偏好快照绑定。旧未绑定 provider 的任务明确耗尽，不猜服务商。输入摘要排除目标日自身自动输出，发布前重新核对输入，旧任务不能覆盖新输入或手动版本。

007 的 `adjust-plan` 只生成建议；`apply_meal_adjustment` 创建新手动版本，`undo_meal_adjustment` 在无后续冲突时另存恢复版本，均不改已吃记录。草稿在源输入变动后过期。食物等变动若仍带相同旧估算，旧估算失效。

008 活动类型为 strength/badminton/other，可只保存本人确认日期与实际时长，started_at/ended_at 同时为 null；如填时刻须一致且真实。日期活动按下一上海零点的时间上界判断恢复，不把此界限存为实际时刻。外部非力量活动不计力量周次数。

版本探测：health_schema_version=4、health_provider_schema_version=5、health_daily_flow_version=7、health_activity_schema_version=8；Edge status.schema_version=7，分别检测，不能用基础版本推断全部能力。

本人导出与清除覆盖健康内容、建议和 AI 结果缓存；最小计费记录仍保留。清除/退出先可靠处理照片，失败中止并允许本人重试；退出后不能自助重入。数据库删除不承诺供应商日志和备份同时擦除。001/002 邀请表与历史并发回归保留，不代表生产重新开放入口。
