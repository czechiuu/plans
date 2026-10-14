# DeepSeek 正式业务与合成验收

截至 2026-10-14，007 的日程、计划、文字/图片估餐、餐后调整及配套 006/008 已部署；DeepSeek 管理员健康业务开关已按用户许可开启，原预算未提高。真实双账号合成 API 10/0，四次正式 DeepSeek 调用共结算 4 美分；个人用途同意仍由两人控制，策略验收后已恢复验收前状态。历史固定合成探针单列，不充当正式业务证据。

## 模型与预算

当前实现使用 `deepseek-flash` 与 `https://api.deepseek.com/responses`，采用 JSON Schema 和真正的 `input_image`。依据：[Responses](https://api-docs.deepseek.com/api/create-response/)、[视觉输入](https://api-docs.deepseek.com/guides/vision/)、[价格](https://api-docs.deepseek.com/quick_start/pricing/)。当前按高峰、缓存未命中的输入 $0.30 / 百万 token、输出 $1.20 / 百万 token 估算费用；估算不是供应商账单。

原 10 美分月度 DeepSeek 限额由探针与正式业务共用，不另开额度。原探针结算 5 美分，本轮正式合成调用另结算 4 美分，无活动预留。本轮脚本对四次付费调用各按最多 2 美分核对，实际各结算 1 美分；每次发送前仍检查批准的 5 美分本轮上限，不足就停止。

## 当前接口

基础健康版本保持 4，服务商版本保持 5；新增 `health_daily_flow_version()=7`、活动版本 `health_activity_schema_version()=8`。Edge `status.schema_version=7` 返回本人计划服务商、配置和预算是否存在、各服务商管理员开关、本人各用途授权与用量，不返回密钥、对方用量或全站余额。

用途为 `parse_schedule|generate_plan|estimate_meal_text|estimate_meal_photo|adjust_plan`。同意 RPC 为 `set_ai_provider_consent(p_provider,p_purpose,p_enabled,p_monthly_limit_cents,p_policy_version)`；政策版本仍为 `2026-10-13-deepseek-health-v1`，OpenAI 使用对应 openai 版本。旧授权不自动转换；图片另行同意。

`set_ai_plan_provider(p_provider)` 控制未来自动任务，默认 rules。手动请求 `request_plan_generation(p_target_date,p_provider)` 明确服务商，建立任务后固定 provider；Edge 生成不能覆盖它。007 的管理员开关关闭时，即使客户端有按钮或旧同意也不能发送。

`health-ai` 的 `parse-schedule`、`estimate-meal`、`generate-plan` 明确传 provider；新增 `adjust-plan {provider,record_date}` 返回独立建议。本人确认应用、撤销和源输入校验见 [完整契约](DAILY-FLOW-CHANGES.md)。配置不明、撤销、超限、超时或无效输出均报告失败，不自动切服务商。

## 真实验收

运行 `node scripts/run-fixed-cloud-tests.mjs --daily-flow`，隐藏输入两个密码。需要明确的日常验收和 DeepSeek 验收环境许可，以及已部署开关和本人四项用途授权。脚本不自动授权、开开关或改预算；只使用本轮合成输入和精确 ID。旧两条任务必须逐 UUID 审核后只读保留；其他既有健康输入会阻塞。清理清单留在被忽略的私有结果目录，未提供精确删除入口的记录交管理员审核。

[真实业务报告](../test-results/daily-flow-cloud-results.json)为 10/0，覆盖双人规则任务及四项 DeepSeek 正式调用；[真实策略报告](../test-results/cloud-health-policy-results.json)为 3/0，核对撤销、个人预算阻断及恢复，未产生新的付费调用。真实网页、上海 20:00 与两台物理手机另行验收。

历史固定探针最新四用途覆盖 4/0，五次响应累计 4/1，其中一次日程失败后单项复测通过；5 条 settled 合计 5 美分。此历史探针不读取私人健康表，也不能替代正式日程→计划→图片→调整验收。供应商余额差额为 0 不能证明免费。

DeepSeek 接口无服务端对话状态不等于零保存，参见[兼容说明](https://api-docs.deepseek.com/guides/responses_api/)。本人在发送前查看实际数据范围和保存边界；管理员许可不能代替本人资料同意。
