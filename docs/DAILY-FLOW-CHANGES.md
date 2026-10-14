# 日常 AI 链路变更（007，已部署）

006 负责生成任务绑定服务商、源版本与照片生命周期；007 在该基础上添加完整日常业务和餐后建议。实现复用原 RPC、计划版本、RLS 和现有库。

截至 2026-10-14，006–009 已在原 Supabase 部署、迁移摘要回读一致，三份函数下载源码与后端 `eea81bb` 的 bundle SHA-256 匹配；详见[发布记录](../test-results/daily-flow-release.json)。三个 GIF / 八视频前端 `da20689ebe98e4815fbe0cf5b402f4d401e2fa40` 已发布，[新版匿名资源](../test-results/deployed-public-results.json) 8/0 且线上与 dist 的 SHA 匹配；[实际线上媒体定向核验](../test-results/exercise-gif-iab-results.json) 7/0，最终真实整轮网页6/1原样保留，不再重试。DeepSeek 管理员健康开关已按用户许可开启，原预算未提高；真实双账号合成 API 10 项通过、0 失败，四次正式调用共结算 4 美分。管理员开关不能代替个人同意。

009 输入快照已在生产应用并回读 MD5 一致，能力探针为9，旧两条 exhausted 任务原样保留、未回填历史。其本人导出前端已发布：只有能力探针返回 9 才按本人身份导出 `generation_input_snapshots`，探针缺失或表读取失败会明确停止完整导出；历史无行不回填，也不能声称可追溯。本轮真实生成已验证，私人导出仍待本人验收。

## 服务与授权

- `health_daily_flow_version()` 返回 `7`；原 `health_schema_version()` 仍为 `4`、`health_provider_schema_version()` 仍为 `5`。
- `health-ai status` 的 `schema_version=7`，原 providers 形状保留，每人每服务商增加 `adjust_plan` 用途。现有 `parse_schedule`、`generate_plan`、`estimate_meal_text`、`estimate_meal_photo` 独立授权不变。
- `set_ai_provider_consent` 参数保持不变；policy 为 `2026-10-13-openai-health-v1` / `2026-10-13-deepseek-health-v1`。没有任何继承 OpenAI 的 DeepSeek 授权。
- 新表 `ai_provider_settings(provider,health_enabled)` 只有管理员可读写；迁移初始 OpenAI=true、DeepSeek=false。启用 DeepSeek 后，本人仍须逐用途授权。`ai_provider_budgets` 的 DeepSeek 10 美分与全站 200 美分均原样保留；探针与正式调用共用原预算。
- DeepSeek 使用 `deepseek-flash` 和 Responses，照片真正作为 `input_image` 传递，不是只发图片名称。采用峰时每百万输入 $0.30、输出 $1.20 预留。官方依据：[模型与价格](https://api-docs.deepseek.com/quick_start/pricing/)，2026-10-14 核对；当前 Flash 支持图片。
- 授权在预算预留前、发出请求前各校验一次；照片在下载后和发送前再次核对 owner/meal/deleting/uploading。已经发出的网络字节不能撤回。
- `ai_request_results` 以本人、服务商、用途、模型/结构/提示/原始输入/图片 SHA-256 去重；并发只领取一次，完成结果可复用。未发送的失败最多重领三次，确定未发送的预留结算为 0；已发出却结果不确定的失败不自动重发，保留保守预算，不假造免费或成功。

## 日程与每日计划

- 日程返回原文 `raw_text`、结构版本、提交时刻和待确认 draft；发送当前固定槽位，时间结构严格校验，原始文本始终保留。仍由本人确认卡核对日期、时间与身份后保存。
- 生成只用 `generation_jobs.provider`；偏好改变、重试或 cron 不会把 rules job 变成 AI 调用。手动申请使用 006 的 `request_plan_generation(p_target_date,p_provider)`。
- 付费前核对源版本、复用同源当前自动计划；发送前再次核对源版本。上下文排除目标日自身自动输出，避免重试产生新输入而重复付费。
- 缺少本人三餐模板时，提供标明假设的一般均衡三餐、拳/掌份量、食堂/外卖/备餐及替代，不再因模板空缺阻断整天计划。不会把未知食量、疾病、过敏、库存当成已知。示例份量是待核对设计值，并非 WHO 个体处方；均衡原则参考 [WHO Healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)。
- 训练仍由保守规则决定：关键条件和近 48 小时史未知则休息。本人确认的运动类型为力量训练/健身时才生成明确时段内的动作；羽毛球和未明确类型不叠加力量。开始时刻原样保留，总时长不超过明确结束时刻、时长及本人规则中最小上限。短窗口采用预先定义的两动作一组短版，连短版也放不下时不延长安排。默认每周最多两次力量，羽毛球/其他活动不计力量次数，但已完成或实际做过的部分活动计入恢复间隔。W 周二不强制训练，未明确全日饮食自由时保留可选三餐；周三不补偿。
- AI 必须保留确定性 baseline 的全部训练字段，不能发明动作、器械或训练量；明确餐食时间必须保留。自动菜单至少有完整早餐/午餐/晚餐，其他餐须有加餐原因；本人确认的全日自由规则可保留空菜单。
- 目标日为周日且本人槽位为 me 时，午餐计划明确列出五份采购（主食 5–10 拳、蛋白质 5 掌、蔬菜 5–10 拳）、五盒分装、周一二冷藏、周三至周五及时冷冻，以及两小时、4°C/−18°C、复热 74°C 的操作提示；周六晚生成周日计划也覆盖。AI 不得删改该采购和储存说明，备餐不会自动计为完成。依据：[FDA Safe Food Handling](https://www.fda.gov/food/buy-store-serve-safe-food/safe-food-handling) 与 [CDC Preventing Food Poisoning](https://www.cdc.gov/food-safety/prevention/)（2026-10-14 核对）。

## 餐后调整

1. 客户端在本人新增、修改或删除已确认餐后，可显式请求 `health-ai {action:"adjust-plan",provider,record_date}`；当前只接受上海今天。没有后台自动付费调用。
2. 返回 `{adjustment,needs_confirmation,ai_request_id}`。`meal_adjustments` 仅本人可读，含 `id,record_date,provider,base_plan_id,source_input_hash,source_snapshot,status,content,applied_plan_id,applied_input_hash,created_at,updated_at`。
3. `content={reason,meal_changes:[{meal_index,meal,reason}],warnings}`，其中 meal 为原完整餐食结构。源快照包含原当前计划、当日全部 confirmed 餐食、日程、训练反馈、规则及槽位；草稿不计入已吃摄入。漏记不当零，没有精确能量缺口假设。
4. 已确认餐别和明确已过时间的计划餐不能修改；没有记录且没有明确时间的餐仍是未知，提示本人核对。建议不能增删餐、改餐名/明确时间或改训练，剩余餐不能清空。
5. 本人确认调用 `apply_meal_adjustment(p_id,p_expected_updated_at)`。原版本保留，创建新 manual 计划版本；不改实际餐食和训练。输入变动、锁定或换版会拒绝应用；重复应用返回同一结果，不再建版。
6. 撤销调用 `undo_meal_adjustment(p_id,p_expected_updated_at)`；仅在当前计划仍是该建议应用版、源输入未变且未锁定时，将原内容另存新版本，保留全部历史。后续手改、已吃记录或其他建议存在时不覆盖。
7. 表状态为 `running/draft/applied/stale/failed/reverted`。餐食、日程、训练和规则变化让草稿过期；应用时重新计算完整 hash。相关本人写 RPC 采用空间→成员→记录锁序。
   同源失败建议最多重领三次；未发送的预算/授权失败可再试，已发出且结果未知的 provider 请求仍被缓存层阻止重复付费。已完成结果可以重用。
8. 本人清除同时删除建议和 AI 结果缓存，最小计费账本仍保留，不能通过清除重置预算。退出通过成员外键级联清理。
9. 实际摄入区间始终为本人确认的整份区间乘 `eaten_fraction`；编辑食物/份量/烹调/油酱后若仍沿用相同旧估算，数据库使其失效，需要重新估算或明确填写新数值。没有营养数据库时不能伪造任意份量修改后的精确热量。

## 合成真实业务验收入口

`scripts/run-fixed-cloud-tests.mjs --daily-flow` 复用隐藏 TTY 密码验证。必须显式设置 `TEST_DAILY_FLOW_APPROVED=YES`。付费部分另外要求 `TEST_DAILY_FLOW_DEEPSEEK_APPROVED=YES`、管理员健康开关与本人四项用途同意均已存在；脚本不替用户授权，不改预算。

真实脚本只在两人健康输入均为空时继续，先计数而不下载既有私人内容；每次付费前再次核对输入只有本轮精确 ID。验证双人 rules、隐私、草稿照片、自然语言确认、AI 计划、图片估算、确认摄入、餐后建议及有改动时的 apply/undo。生成无变化建议会如实标记 apply/undo 阻塞，不能伪造改动。

双人 rules 仅入队后轮询精确 job，最多等待六分钟，由现有五分钟 cron 真正领取发布，不直接调用生成，也不改调度或读取密钥。每三十秒打印简短等待状态；超时按失败报告，不手动代替。这验证后台 worker，不代表上海 20:00 准点已验收。另有免费 008 日期活动保存、独立客户端登录同用户读回及伴侣隔离检查，只清理该条精确 ID。

仅有一个只读旧任务例外：管理员显式提供 `TEST_DAILY_FLOW_BASELINE_JOB_IDS` 两个已审核 UUID，脚本分别核对每人一条、exhausted、plan_id=null、scheduled、旧目标日 2026-10-14、错误码 MEAL_TEMPLATE_UNCONFIRMED，且其他健康输入为空，才纳入只读 baseline。不会复用、修改或清理旧任务，清理阶段再核对元数据完全相同。不明确的旧任务继续阻塞。

本轮付费脚本对解析、计划、图片估算、餐后调整统一按每次最多 2 美分核对：开始前四个用途的本人余额各须至少可预留 2 美分；每次发送前重新读取状态，要求本轮已结算与预留增量再加 2 美分不超过用户批准的 5 美分。第四次调用先等待本人每分钟三次的限流窗口，再重查授权、资料和预算；不会自动重试已发送的付费请求。四次真实调用最终各结算 1 美分，共 4 美分；服务端仍对并发及全部预算原子核对。

能安全清理的本轮照片/餐食/日程按精确 ID 清理。计划、job、建议、AI 缓存没有客户端精确删除接口，曾写 `test-results/private/daily-flow-cleanup.json` 供管理员审核；[来源只读核验](../test-results/cleanup-source-verification-results.json)通过 24/0。[08:33 单轮 UI 记录](../test-results/ui-retry-cleanup-results.json)先精确清理；随后[最终清理报告](../test-results/final-synthetic-cleanup-results.json)记录主清理先回滚预演后提交，独立基线计划经原子守卫提交，两者回读通过：合计精确删除计划6、任务3、建议调整1、AI缓存4、规则1、创建回执4，目标 owner API 记录、照片 Storage 对象及任务输入快照剩0，隔离回归7/0。规则更新时间一致才删除；旧两条任务、计费账本、本人授权和预算设置整行保护核对未变。餐食删除后创建回执仍在，只有归档文件与数据库精确映射核对过的回执才纳入清理；来源丢失的首轮 UI 回执1条保留，不能称所有测试元数据清空。真实验收应在用户暂停编辑时进行，避免外部并发录入真实资料；本地合成回归无此生产风险。

## 验证证据与限制

- 最终定向 Node + 隔离 PGlite：18 通过、0 失败（含实际 SQL 力量时段成功、偏移/超时段/羽毛球拒绝、周日五份采购冷冻、餐后应用/撤销/历史/隐私/过期/有限重试/预算/撤销/清除/过期估算失效、图片 payload、缓存去重、发送前撤销、rules 固定服务商/重试零网络）。命令：`node --test tests/daily-flow.test.js tests/daily-flow-edge.test.js tests/health-ai-boundary.test.js tests/health-rules.test.js tests/deepseek-probe.test.js`。
- cron 匿名拒绝与聚合错误脱敏的新版 job/provider 夹具另行 1 通过、0 失败；没有放宽错误码断言。
- 008 日期活动衔接定向验证 6 通过、0 失败：仅日期活动按该日结束的上海零点上界计算恢复，绝不伪造实际结束时刻；旧无结束时刻训练仍要求核对。AI 最小反馈同步保留本人确认的活动日期。
- 真实双账号合成 API [10/0](../test-results/daily-flow-cloud-results.json)，四次 DeepSeek 正式调用各结算 1 美分、合计 4 美分；真实授权撤销、个人预算与恢复[3/0](../test-results/cloud-health-policy-results.json)，无新增费用。[10:12:16 最终真实整轮](../test-results/cloud-health-ui-20261014-1812-results.json) 6/1/0，唯一媒体断言抢在加载完成前；[免登录真实GIF生命周期](../test-results/frontend-gif-lifecycle-results.json)3/0核对最终加载，不改写整轮结果。10:05前置1/1/5、[09:31旧发布版](../test-results/cloud-health-ui-20261014-1731-results.json)5/2/0、[更早](../test-results/cloud-health-ui-20261014-1633-results.json)6/1/0均保留历史。实际 20:00 和两台物理手机未运行。
- 数据库并发、006/007 部署 wrapper 的证据由 backend_integrity 产物记录；主代理统一执行最终全套、构建与部署检查。
