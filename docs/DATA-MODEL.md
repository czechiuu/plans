# 数据结构与权限

此文描述已实现的第一阶段；未来实体为设计，尚未建表。

## 已实现

| 实体 | 主要字段 | 权限与约束 |
|---|---|---|
| auth.users | Supabase账号、邮箱与身份 | Auth托管，前端不查询别人的邮箱 |
| spaces | id、name、created_at | 当前成员可读，只通过RPC创建 |
| members | space_id、user_id、display_name、4个共享/代改开关 | 每人一个空间，最多两人；只能本人修改自己的开关 |
| invites | token_hash、expires_at、consumed_at、created_by | 高熵一次token，仅hash入库、24小时有效；不能查询列表；关系退出撤销旧邀请 |
| health_profiles | 身高、年龄、性别、基线/日期、目标/日期、偏好/伤情原文、is_shared | 未知可空；档案基线不算一次体重记录；仅本人编辑 |
| schedules | record_date、raw_text、start/end_time、exercise_intent、fixed_arrangements、meal_conditions、constraints、is_shared、version | 每人每天一条确认日程，整合当天安排；同日重复返回冲突 |
| weights | record_date、measured_at、weight_kg、waist_cm、notes、is_shared | 每人每天一条真实体重；测量时刻如有需与上海记录日一致；补录允许无测量时刻 |
| audit_events | entity、entity_id、action、user_id、actor_id、created_at | 仅本人/实际修改者在当前空间可读，无原文、数值、照片或密钥 |

健康表共同字段：id、space_id、user_id、created_at、updated_at、updated_by。身份由Auth及服务端派生，不能转移给其他人或空间。写权限不授予客户端直接表操作，使用固定search_path、显式授权的RPC。读启用Postgres RLS；匿名无表权限。编辑带expected_updated_at，冲突须重载后人工判断。

共享读取 = 同一当前空间 + 所有人类别共享开关 + 该记录is_shared。类别开关不使未来新增记录自动共享。代改再要求allow_partner_edit；不能改对方的共享确认或身份。退出后立即取消关系，留守成员的共享/代改开关归零，换人需重新确认。

日程和体重全部分页加载，支持任意历史补录与更正；导出本人记录同样不截断。审计接口仅返回最近100条元数据。7日平均是指定自然日往前6天至当日的实际体重算术平均，展示样本数；缺失不插值。日期字段date，发生时刻timestamptz；呈现与相对日期统一上海，数据库宿主时区不决定目标日。

## 待后续阶段实现

- schedule_inputs/confirmations：解析原文、提交时刻、歧义、结构化确认与输入版本。
- plan_versions / plan_items：空间目标日、双人一致发布、来源、输入快照版本、锁定、手改、校验状态。
- exercises / media_sources：动作库、合法准确示范、授权与人工核对；training_sessions / sets保存实际完成。
- generation_jobs：应执行时间、固定目标日、唯一任务、领取状态、重试、脱敏错误和原子发布。
- meals / meal_estimates / photo_assets：草稿/确认、份量修正、餐前餐后关联与去重、私有对象权限。
- ai_consents / ai_usage：具体用户/provider/purpose/policy版本授权、状态/用量/预算；第一阶段不收泛化授权、不调用AI。

## 实际删除边界

- 删一条记录：当前表行删除，保留不含健康内容的操作元数据。
- 清除本人健康数据：删除本人档案、日程、体重及归属于本人的审计；保留账号和成员关系。代改另一人的审计属于对方记录，不删除对方健康数据。
- 退出空间：本人健康数据删除、本人成员关系删除、邀请失效；留守者需要重新确认共享。Auth账号未删除。
- 数据库服务商的备份可能保留历史直到其实际保留周期结束，不声称即时擦除所有备份；云端未启用前无法核验控制台具体备份策略。删除Auth账号和照片阶段的文件清理需后续实现/验收。
