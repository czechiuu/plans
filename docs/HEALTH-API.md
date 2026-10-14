# 健康功能后端接口（004 基线契约）

本文保留 004 基线接口及其历史运行结果；当前生产已部署 006–009 和本轮函数，新增或变更的接口须按 [日常链路契约](DAILY-FLOW-CHANGES.md)、[数据模型](DATA-MODEL.md)及迁移源码核对，不能以本页旧签名调用。历史首次固定合成探针 3/4 通过，随后日程单项复测 1/1 通过，保守结算 5 美分；旧两条定时任务因当时餐食模板未确认而失败，不能推断新版发布结果。所有日期为上海日 `YYYY-MM-DD`。仅两位固定账号可用。前端只持 Supabase publishable key 与本人 JWT，不接触 service_role 或 AI 密钥；健康表的写入走 RPC 或 Edge Function。

## 权限与通用字段

新记录统一有 `id,space_id,user_id,is_shared,created_at,updated_at,updated_by`；`space_id/user_id` 由服务端定，前端不得转移。本人可读写；伴侣读取同时要求同固定空间、对应成员类别开关与该条 `is_shared=true`。扩展成员开关为 `share_plan,share_training,share_meal,share_photo`，初始全为 false；`save_health_sharing(p_settings jsonb)` 只改本人这四个布尔值。对方只在所有者 `allow_partner_edit=true` 且类别与单条均共享时可代改计划/训练/餐食正文，不能创建、删除、改日期、锁定状态、分享标记或身份；`updated_by` 记录实际操作者。照片、个人规则、AI 同意仅本人可操作。

编辑 RPC 带 `expected_updated_at`；旧版本返回冲突，不静默覆盖。列表读用 `from(table).select(...)` 分页，绝不能将未加载历史当完整统计；本人导出/清除也覆盖新实体与私有照片。账号退出前先删本人 Storage 对象再清数据库；服务端流程失败则不删数据库、明确报错。照片下载每次检查授权，撤销提交后的新请求无权下载；已开始传输的字节无法追回。不发长期签名链接。

## 个人规则与输入版本

`health_rules` 每人至多一条，`rules` 为已确认 JSON：`{confirmed:boolean,equipment:"unknown"|"machines_only"|"dorm"|"mixed",ankle_status:"unknown"|"recovery_unknown"|"limited"|"cleared"|"no_issue",free_weekdays:number[],exercise_minutes:number|null,max_session_minutes:number|null,max_gym_visits:number|null,weekly_strength_limit:number|null,free_day_training_forbidden:boolean,free_day_meal_unrestricted:boolean,training_history_complete:boolean,meal_portions:string|null,prep_method:string|null,meal_notes:string|null,limitations:string|null,sleep_condition:string|null,meal_template:null|[早餐,午餐,晚餐]}`。`meal_template` 每餐使用计划 `meals[]` 的完整字段，必须是本人确认的 3 餐；缺失时规则生成明确失败，不发布空饮食计划。本人确认的自由日若 `free_day_meal_unrestricted=true` 则计划不提供菜单，三餐模板要求对此日豁免。`training_history_complete` 仅本人确认应用记录涵盖近 48 小时及外部训练后才能打开；未确认时只能安排休息。所有限制只由本人录入确认，不预填真实资料；无踝部问题可由本人选 `no_issue`，旧伤恢复未知选 `recovery_unknown` 并先休息。`confirmed=false` 或关键项 unknown 时规则生成只能给明确休息/待确认，不编造训练。星期按 ISO 1=周一…7=周日。目标日期过期只提醒本人再次确认，不自动延期。`save_health_rules(p_rules jsonb,p_is_shared boolean,p_expected_updated_at timestamptz default null)` 返回单行；本人专用。日程 `schedules.version`、个人档案更新时间、规则版本及近 48 小时训练史形成生成输入快照 `input_version`；日程/规则/档案/训练变更使现行计划 `is_stale=true`，保留旧版本和已完成训练。

## 每日计划

`daily_plans` 按 `(user_id,target_date,version)` 保存不可覆盖的版本，列 `source=manual|rules|ai`、`status=draft|published`、`is_locked`、`is_stale`、`input_version`、`content`（JSON）、`generated_at`、`scheduled_for` 与通用字段。同一人同日仅一个当前版本；锁定或已有真实完成记录时自动生成不得覆盖，旧版保留。`content` 固定形状：`{summary:string,meals:[{time:null|"HH:MM",title,foods:[{name,portion,unit}],prep_method,purchase_or_prep,alternative,notes,snack_reason:null|string}],training:{mode:"rest"|"workout",purpose,time:null|"HH:MM",intensity,equipment,muscles:string[],warmup:[{description,seconds}],items:[{exercise_id,sets,reps,work_seconds,rest_seconds,transition_seconds,first_use_check,short_option}],cooldown:[{description,seconds}],total_seconds},warnings:string[]}`。`exercise_id` 必须来自 `shared/exercises.js` 的 `exercises`；自动计划只可引用 `demo.verificationStatus==="verified"` 的动作。`total_seconds` 必须等于热身、每组动作、组间休息、换器械、放松之和。

`save_daily_plan(p_target_date date,p_content jsonb,p_expected_version integer default null,p_is_shared boolean default false,p_owner uuid default null)` 创建手动新版本，返回单行；`set_plan_lock(p_id uuid,p_locked boolean,p_expected_updated_at timestamptz)` 仅本人锁/解锁。自动发布的三餐必须与本人确认模板逐项一致；自由日若本人确认不提供菜单，则自动发布空菜单。AI 不能自行缩减份量或改餐数，餐食变化先由本人调整模板或作为待确认建议；手动计划由本人自行编辑。`request_plan_generation(p_target_date date)` 为本人排入手动生成 job，不立即假称计划已发布；`retry_generation_job(p_id uuid)` 仅本人对失败且未超上限的 job 重试。新日程在 20:00 后提交仍只标旧计划 stale、保留版本；需要本人主动重生成。

`generation_jobs` 是每人每天独立的 job，唯一 `(user_id,target_date,kind)`，状态 `queued|running|succeeded|failed|exhausted`，有 `scheduled_for,target_date,attempts,max_attempts,next_run_at,error_code`。20:00 上海时间等于 12:00 UTC；自动 job 的 `target_date=(scheduled_for AT TIME ZONE 'Asia/Shanghai')::date+1`，迟到跨午夜不改目标。服务端领取用行锁与有限重试，同一 job 幂等发布，`me`/ `w` 独立成功/失败，不再等两人共同确认。

## 训练记录与餐食

`training_sessions` 的 `data`：`{plan_id:null|uuid,status:"active"|"paused"|"completed"|"stopped",started_at,active_since:null|string,rest_until:null|string,rest_remaining_seconds:number,ended_at:null|string,elapsed_seconds:number,stop_reason:null|string,sets:[{exercise_id,set_index,reps,load_kg:null|number,rpe:null|number,pain_note:null|string,stop_reason:null|string,skipped:boolean,completed_at:null|string}]}`。`elapsed_seconds` 是此前累计时间，运行中刷新用 `active_since` 到当前时间补足；active 时 `active_since` 必填，其他状态必须为 null。暂停时清空 `rest_until` 并存 `rest_remaining_seconds`，恢复时从剩余秒重建绝对时间，刷新不重置休息。无组停止训练可用顶层 `stop_reason`，不用造假组。训练真实完成单独保存，不因计划改版改变；暂停/恢复、组间休息与计时状态持久化。`save_training_session(p_payload jsonb,p_id uuid default null)` 返回单行；新建本人，代改权限按上文，删除仅本人。`p_payload={data,status,is_shared,expected_updated_at}`，更新必须带版本戳。

`meals` 的 `data`：`{recorded_at,kind,items:[{name,portion,unit}],eaten_fraction,shared_meal_id:null|uuid,photo_ids:uuid[],cooking:null|string,oil:null|string,leftover:null|string,estimate:null|{energy_min_kcal,energy_max_kcal,uncertainty,assumptions}}`；`status=draft|confirmed`，仅 confirmed 参与摄入汇总。确认后修正仍更新同一 meal id，不能另计一餐；共享餐用 `shared_meal_id` 关联各人的摄入份额，不把他人份额加给本人。`save_meal(p_payload jsonb,p_id uuid default null)` 返回单行；`delete_meal(p_id uuid)` 仅本人。`p_payload={data,status,is_shared,expected_updated_at}`，更新必须带版本戳。

`photo_assets.meal_id` 是照片归餐的权威关联；餐食编辑只增加请求中明确引用的照片，不会因正文保存遗漏 `photo_ids` 而隐式解除已有照片。`photo_assets` 另存 `sha256,storage_path,mime,width,height,bytes,is_shared,deleting`，每位所有者的相同 SHA-256 不重复存储，可将多张前/后照片关联同一餐。私有 Storage bucket 永不公开。Edge `health-photo`：`POST ?action=upload` 接收净化后的 PNG（≤4 MiB，服务器限制整个请求大小、解析 chunk/CRC、实际解压像素流并拒绝元数据与损坏图）；`GET ?action=download&photo_id=...` 每次按当前 RLS/共享授权代理下载；`DELETE ?action=delete&photo_id=...` 仅本人先原子标记 `deleting` 隐藏/禁止复用，再删对象并解除关联。删除中断可重试，不给长期有效签名 URL。前端 canvas 净化只是第一道，服务端仍验证。

已上传照片的单条 `is_shared` 不支持事后修改；要撤销单张照片需删除该照片。关闭本人照片类别共享后，对方的新读取请求立即失去授权。

## 004 AI 与费用（005 后通用授权入口停用）

以下为 004 历史接口；005 部署后须使用 [供应商与用途分开的新接口](DEEPSEEK.md)，旧授权会关闭。`ai_consents` 原为本人 `text`/ `photo` 分别授权：`provider,policy_version,enabled,monthly_limit_cents,consented_at,revoked_at`；`set_ai_consent(p_kind text,p_enabled boolean,p_monthly_limit_cents integer,p_policy_version text)` 仅本人。Edge `health-ai` 只在对应同意、服务端 `OPENAI_API_KEY` 与 `OPENAI_MODEL` 均配置且预算足够时工作；否则明确拒绝，不调用外部 AI。模型/价格/保留政策待管理员核对后配置。每次在数据库锁内按最大输入/输出 token 的最坏费用预留预算，响应后结算或释放；有限 token/timeout，零余额不调用。调用 OpenAI Responses，不启用工具；用户原文与 OCR 当数据而非指令，只发当次最小输入，日志仅元数据/错误码，不记录健康原文、照片、密钥。文字/照片估算先返回草稿供本人核对，绝不自动确认或重复计数。

## 错误与部署边界

`estimate-meal` 的 `draft` 是 `{recognition_status,items:[{name,portion,unit,confidence}],energy_min_kcal:null|number,energy_max_kcal:null|number,uncertainty,assumptions,cooking,oil,leftover}`。估算照片按 `photo_assets.meal_id` 查询；有关联照片时必须有独立照片 AI 同意，不会静默改成纯文字估计。`health-ai` 的 `status` 返回本人本月文字/照片各自已计费、预留、上限及服务/预算是否配置，不透露他人用量或密钥。

三个 Edge Function 均由 `node scripts/build-edge.mjs` 生成 `supabase/bundles/*.js` 单文件；三者网关均设 `verify_jwt=false`，兼容本项目 ES256 用户令牌与浏览器 OPTIONS 预检。`health-ai`、`health-photo` 在函数内依次用 Supabase Auth `getUser(jwt)`、固定槽位 `current_account` 和空间成员 `current_space_id` 核验本人；匿名或仅持公开 key 的调用不能进入业务。`health-cron` 不由浏览器调用，函数内严格核对至少 32 字符随机 `HEALTH_CRON_SECRET`。CORS 的 `HEALTH_ALLOWED_ORIGINS` 为精确 Origin 列表，正式站用 `https://czechiuu.github.io`，本地可加 `http://localhost:5173` 或 `http://127.0.0.1:5173`；预检允许 Supabase SDK 的 `x-client-info`。Cron 部署脚本 `supabase/admin/schedule-health-cron.sql` 仅引用 Vault 中的项目 URL、publishable key 和独立 cron secret，不含值；每 5 分钟幂等处理最近上海 20:00 的每人次日任务及有限重试。当前生产 Vault、Edge secrets 与本月全空间预算已配置；缺少 AI 密钥或预算时仍不可调用付费 AI。

`health_schema_version()` 返回标量整数 `4`。旧生产 003 尚无此 RPC；前端只在确切 PostgREST 缺函数错误 `PGRST202` 时显示健康功能未部署，继续旧功能；其余错误正常暴露。`save_confirmed_schedule(p_payload jsonb,p_id uuid default null)` 同事务保存原始日程字段及本人确认的 `confirmed_data`（`user_slot,record_date,exercise,meal,constraints` 及疲劳/疼痛/睡眠等）、`submitted_at`、`parse_version`，只有本人能确认且人物/日期必须匹配。004 的 `health-ai` 的 `parse-schedule` 请求 `{raw_text,submitted_at}` 返回 `{draft,needs_confirmation:true,parse_version:"health-schedule-v1",submitted_at}`；`estimate-meal` 请求 `{meal_id}` 返回 `{draft,needs_confirmation:true}`；`generate-plan` 请求 `{job_id}` 返回 `{job_id,status,plan_id:null|uuid,error_code:null|string}`。`health-photo` 上传用 multipart `file`、可选 `meal_id` UUID、`is_shared` 布尔，返回 `{photo_id,mime,width,height,bytes}`。005 部署后上述 AI 请求均须显式 `provider`，以 [DEEPSEEK.md](DEEPSEEK.md) 为准。RPC 输入 JSON 类型、长度、日期、身份与版本严格校验；未授权统一拒绝，不泄漏对方私有行是否存在。004 已经本地隔离测试并由管理员按迁移历史部署；照片 bucket、Edge secrets、Cron 调用与 AI 预算未配置时相关功能必须显示不可用。
