# DeepSeek 合成验收与 005 接口

005 只为两家 AI 供应商分别记录授权、用途和费用。当前真实健康资料仍只可能选择已独立授权的 OpenAI；DeepSeek 的健康请求在数据库和 Edge Function 两层拒绝。规则计划 `rules` 不需要 AI 同意、密钥或预算。DeepSeek 只留一个管理员密钥保护的**固定合成探针**；没有本人的真实日程、档案、餐食或照片查询。

## 官方依据与边界

- DeepSeek [Responses API](https://api-docs.deepseek.com/api/create-response/) 当前支持 `deepseek-flash`、`/responses`、`text.format.type=json_schema`、`input_image`；[视觉说明](https://api-docs.deepseek.com/guides/vision/) 给出单图最多 1024 输入 token。服务端再按固定 JSON Schema 校验，模型返回并不直接成为已确认的日程或餐食。
- [官方价格表](https://api-docs.deepseek.com/quick_start/pricing/)中 Flash 高峰、缓存未命中价格为输入 $0.30 / 百万 token，输出 $1.20 / 百万 token。本地预留按这一较高价格计算；结算是根据响应 token 的**保守估算**，不是供应商账单。价格变化必须先更新并复核费用边界。
- [Responses 兼容说明](https://api-docs.deepseek.com/guides/responses_api/)称接口无服务端对话状态，`store` 参数不支持。这不等于零日志或零数据留存。
- [英文隐私政策](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html?locale=en_US)提到服务不以处理健康等敏感个人数据为目标；同一政策也指出开发者下游应用的终端用户处理规则不由该政策直接覆盖。中文政策未找到对应措辞。因此这里不推断 API 永久禁止健康资料；本轮按用户指定先只做合成测试，将来若要发送真实资料，需另核适用的 API 条款并取得本人独立授权。

## 前端与数据库契约

`health_schema_version()` 仍返回 4；`health_provider_schema_version()` 返回 5。未部署 005 时，仅该新 RPC 的 `PGRST202` 可解释为新 AI 入口不可用，旧健康记录继续工作。005 保留旧资料；004 的通用文字/照片授权迁移成**关闭**的 legacy 行，不能自动映射为新授权。

`ai_consents` 本人可读，关键列为 `provider,purpose,enabled,monthly_limit_cents,policy_version`。`provider` 为 `openai|deepseek`，`purpose` 为 `parse_schedule|estimate_meal_text|estimate_meal_photo|generate_plan`。本人 RPC `set_ai_provider_consent(p_provider text,p_purpose text,p_enabled boolean,p_monthly_limit_cents integer,p_policy_version text)` 返回一行；OpenAI 政策版本为 `2026-10-13-openai-health-v1`，DeepSeek 为 `2026-10-13-deepseek-health-v1`。当前 DeepSeek 不能开启。`set_ai_plan_provider(p_provider text)` 返回 `rules|openai|deepseek`，默认 `rules`，DeepSeek 目前拒绝选择；取消 OpenAI 生成授权立即切回 `rules`。

`health-ai` 的 `parse-schedule`、`estimate-meal` 请求必须显式给 `provider:"openai"|"deepseek"`；`generate-plan` 必须显式给 `provider:"rules"|"openai"|"deepseek"`，与本人已存计划供应商选择不一致时拒绝。DeepSeek 的真实健康请求即使客户端绕过按钮也明确失败。`status` 的 005 形状为 `{schema_version:5,plan_provider,global_budget_configured,providers:{openai:{configured,model,budget_configured,health_enabled,consents:{[purpose]:{enabled,monthly_limit_cents}},usage:{[purpose]:{charged_cents,reserved_cents}}},deepseek:{...}}}`；只显示本人用途授权/用量，不返回密钥、对方用量或全站余额。旧 004 `status` 形状不代表 005 已准备好。

## 管理员合成探针

`health-cron` 的 `POST {"action":"probe-deepseek"}` 在确认 `HEALTH_CRON_SECRET` 后运行固定四项合成任务：明确人/日期的日程、文字示例餐、项目内已净化的苹果香蕉公共领域小图、休息型三餐模板计划。照片来源见 [AI-TEST-ASSETS.md](AI-TEST-ASSETS.md)。已部署的 `POST {"action":"probe-deepseek-schedule"}` 只重复同一条固定合成日程，不接收任意文本或图片。它们不读取健康表；只返回每项结构/关键内容是否通过、响应 token、费用上界估算，以及若供应商余额接口可读时的美元余额差额。新版日程结果另返回 `schema_valid` 与 `checks:{slot,date,start,end,duration}` 布尔诊断，不返回模型原文。余额差额不能独立归因到本次探针，故标 `balance_delta_is_attributable:false`，绝不返回绝对余额。

探针依赖服务端 `DEEPSEEK_API_KEY`、当月全站预算和独立 DeepSeek 预算；任一缺失便不发付费请求。005 已在生产执行并回读检查 7 项通过；[本月供应商预算 SQL](../supabase/admin/set-ai-provider-budgets.sql) 也已执行，全站上限 200 美分、DeepSeek 合成上限 10 美分。三份 Edge Function 已部署，最新 `health-ai` 与 `health-cron` 更新也已上线。首次四项合成探针 HTTP 200：文字餐、图片餐、休息计划 3 项通过，日程 1 项未通过；随后仅固定日程复测 HTTP 200，`schema_valid` 与 `slot/date/start/end/duration` 全为 true，单项通过。最新四个用途各有实际有效合成结果，**不是一次四项全部通过**。复测输入 768、输出 97 token，保守结算 1 美分；本月合计 5/10 美分、预留 0。全部为固定合成数据，没有发送真实健康资料。`node scripts/prepare-ai-provider-migration.mjs` 仍可生成 005 SQL Editor 执行包；它先核 001–004 的登记原文、固定两账号，再对 005 源做 LF 规范/MD5，执行与登记同一事务，重复同源执行不重建。
