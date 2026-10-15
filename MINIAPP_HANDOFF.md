# 原生微信小程序交接（体验版已设置，双人真机待验收）

2026-10-14 新增独立 `miniprogram/`，原生五主页面及六个次级页面复用下列接口。用户确认尚未注册：AppID、后台域名登记、微信开发工具编译、实体手机和体验二维码均未验证。导入及使用见 [项目说明](miniprogram/README.md)，实际执行/阻塞/双人手机清单见 [本轮验收](docs/MINIAPP-ACCEPTANCE.md)。保留下面的服务端契约，不另造 API。小程序当前仅接受 publishable 公共 key，不接受管理密钥。

2026-10-15 后续：项目配置的 AppID `wxa45b1a88790a49ec` 与后台“汪汪饼饼”一致。个人主体未备案、未认证；管理员存在，项目成员 0、体验成员 0。三类 Supabase 服务器域名已经保存、读回，合法域名校验保持开启。官方工具安装、登录及 CLI 端口均已完成；preview 编译成功（182707 字节），开发版 `0.1.0` 上传后已设为体验版，入口 `pages/login/index`。真实体验二维码已从后台核对保存、私有交付，标注 10 月 22 日前有效，不公开提交二维码；先前漏弹窗的失败截图不作为交付。管理员手机本人反馈扫码打开与登录成功；没有代理采集的手机网络或完整业务证据，W 尚未验收。工具授权成功、官方登录页截图（363×785）、MCP 自动化超时和官方 Automator 探针成功分别保留。本人在模拟器登录“我”后，[免费原生合成验收](test-results/native-free-flow-20261015.json)最终 20 通过、0 业务失败，另 1 阻塞、5 未运行；3 条本轮合成记录经精确来源和版本守卫清理、回读不存在。双人真机及跨端一致性仍未验收。见[后台读回](test-results/wechat-admin-readback-20261015.json)和[官方工具执行](test-results/wechat-native-build-20261015.json)。

隐私首轮已被拒，原因仅为选中照片或视频接口的用途说明不符合接口场景。第二版仅将该字段改为“上传餐食照片，记录本人的每日饮食。”，保留其余用途、联系渠道、补充说明和模板；本人再次审阅真实预览并逐次批准后已提交，后台重新读回审核中。首轮拒绝保留，第二版最终有效内容、审核通过与生效待核。[提交事实稿](docs/MINIAPP-PRIVACY-DRAFT.md)不是审核通过证明；照片流程仍受其阻塞。本轮 AI 调用和费用均为 0，不改 AI 授权限额、规则或本人真实资料。仅 3 条已核对来源、版本和整行内容的本轮合成记录被清理。新版导入包路径为 `dist-native/plans-native-experience-0.1.0-20261015.zip`。上方 10 月 14 日为历史，不作为当前缺 AppID、域名未登记或编译未运行的结论。

本清单按当前 `src/api.js`、`src/fixed-account.js`、001–010 迁移及 `health-ai`/`health-photo` 函数整理。010 增加的是服务端生成发布关联与预算计算，不改客户端 RPC 签名、返回或版本探针。目标是让原生微信前端接入**同一个 Supabase 项目、同两个密码账号、同一套记录和权限**。不接微信登录，不开放注册、建空间或邀请，不新增服务端接口。本文件不是小程序可用或真机通过的证明；部署状态仍以实际回读为准。

## 身份、会话与读取

- 登录仍用 Supabase Auth 密码方式，固定槽位 `me`/`w` 对应 `src/fixed-account.js` 的两项邮箱；密码由本人输入，不写入代码、日志或文档。登录后用 Auth `getUser`、RPC `current_account()` 核对令牌用户、固定邮箱和所选槽位，再以 `current_space_id()`/`members` 核对指定空间。微信身份或仅持公开 key 不能代替本人 JWT。
- 前后台切换、会话恢复和刷新前重核当前槽位；写入时捕获本次 JWT，账号变化即停止，不能用上一人的会话发请求。到期按 Supabase Auth 刷新；失败回登录，不沿用旧缓存。退出遵循现有 `signOut({scope:'local'})` 语义，清除本机令牌和健康页面缓存并确认无会话。“我”与 W 不共用本地会话。
- 原生 HTTP 对照：[Supabase Auth 的 `/token` 契约](https://github.com/supabase/auth/blob/master/openapi.yaml)是 `POST /auth/v1/token?grant_type=password`，JSON `{email,password}`；刷新为同一路径 `grant_type=refresh_token`，JSON `{refresh_token}`。两者成功取得 `access_token,refresh_token,token_type,expires_in`，持有者用 `GET /auth/v1/user` 的 `id,email` 再核固定账号；失败不得进入业务。刷新令牌可能轮换，只保存新返回的一对令牌并串行刷新，不能让并发请求复用旧令牌。公开 `apikey` 与 JSON 内容类型随请求发送；令牌只在本机安全会话存储，不写日志。若采用兼容小程序运行时的 Supabase SDK，仍应达到同一返回字段和槽位复核结果。
- 读取用 publishable/anon 公共 key、本人 JWT 和 PostgREST RLS。当前 `load()` 检查 `health_schema_version()=4`、`health_provider_schema_version()=5`、`health_daily_flow_version()=7`、`health_activity_schema_version()=8`；读 `spaces`、`members`、`health_profiles`、`schedules`、`weights`、`audit_events`（最近 100 条）以及 `health_rules`、`daily_plans`、`generation_jobs`、`training_sessions`、`meals`、`photo_assets`、`ai_consents`、`meal_adjustments`。列表和趋势按需分页，不把第一页当全部。
- 伴侣读取同时需要同空间、所有者类别开关和单条 `is_shared=true`；代改再需 `allow_partner_edit`，且不得改对方日期、所有权、共享位、锁定或删除。新记录默认私有。界面隐藏不能替代 RLS/RPC。

## 已有接口对照

下表写入均为 `/rest/v1/rpc/<函数名>`，带 `Authorization: Bearer <本人 JWT>` 与公共 `apikey`。现有 Supabase 客户端对返回记录使用 `.single()`；原生请求须核对 PostgREST 的对象响应头或正确解析其行数组，不能把数组当对象。保留 HTTP 状态与 PostgREST 错误，不吞冲突。`record_date`/`target_date` 是上海日 `YYYY-MM-DD`；实际时刻为带时区 ISO 时间，未知时刻保持 `null`。

| 功能 | 调用与关键输入 | 返回和边界 |
|---|---|---|
| 日程 | `save_schedule(p_payload,p_id)`：`user_id,record_date,raw_text,start_time,end_time,exercise_intent,fixed_arrangements,meal_conditions,constraints,is_shared`；确认结构用 `save_confirmed_schedule`，另带 `confirmed_data,submitted_at,parse_version`。编辑带 `expected_updated_at`。 | 返回 `schedules` 行，保留原文与版本。AI `parse-schedule` 只给待核对草稿，本人确认后另存；人物、日期、时间及限制不自动代确认。每人每天一条；冲突或越权显式报错。 |
| 计划 | 读 `daily_plans` 的 `target_date,version,is_current,source,status,is_locked,is_stale,content`；手动 `save_daily_plan(p_target_date,p_content,p_expected_version,p_is_shared)`；`request_plan_generation(p_target_date,p_provider)` 入队、`retry_generation_job(p_id)` 重试、`set_plan_lock(p_id,p_locked,p_expected_updated_at)`。 | 入队返回 `generation_jobs`，不等于已发布；刷新 job `queued/running/succeeded/failed/exhausted` 与当前计划。旧版保留；锁定、陈旧输入与失败码必须可见。规则或供应商绑定不随重试改变。 |
| 照片与估餐 | 先创建本人 `meals` 草稿；净化 PNG 以 multipart `file` 上传 `POST /functions/v1/health-photo?action=upload`，可附 `meal_id,is_shared`；再 `POST /functions/v1/health-ai` `{action:'estimate-meal',meal_id,provider}`。 | 上传返回 `{photo_id,mime,width,height,bytes}`；估算返回 `{draft,ai_request_id,needs_confirmation:true}`。有照片需独立照片 AI 授权。草稿仅供本人核对，不能自动计入。私有 PNG 用带 JWT 的 `GET ...health-photo?action=download&photo_id=...` 作为二进制处理；删除 `DELETE ...?action=delete&photo_id=...`。 |
| 餐食确认 | `save_meal(p_payload,p_id)`：`{data:{recorded_at,kind,items,eaten_fraction,shared_meal_id,photo_ids,cooking,oil,leftover,estimate},status:'draft'|'confirmed',is_shared,expected_updated_at?}`；新建可带 `client_request_id` UUID。 | 返回 `meals` 行；只汇总 `confirmed`。食物、份量、油酱、剩余由本人核对。新建重试复用同一请求 ID 与原 payload；同键改内容或原记录已删会失败，不自动换键再造一餐。 |
| 餐后调整 | `POST /functions/v1/health-ai` `{action:'adjust-plan',record_date,provider}`；本人采用/撤销用 `apply_meal_adjustment(p_id,p_expected_updated_at)`、`undo_meal_adjustment(...)`。 | AI 只生成 `meal_adjustments` 建议。采用/撤销返回调整行，由本人明确操作并另存计划版本；原计划、已吃记录与历史保留。建议过期、源输入变更、计划替换或锁定时显示错误。 |
| 体重 | `save_weight(p_payload,p_id)`：`user_id,record_date,measured_at?,weight_kg,waist_cm?,notes?,is_shared,expected_updated_at?`。 | 返回 `weights` 行；每天本人最多一条，填了时刻须属于该上海日。基线档案不冒充测量。编辑冲突或越权报错。 |
| 训练及实际运动 | `save_training_session(p_payload,p_id)`：`{data,status,is_shared,expected_updated_at?}`；力量 `data` 含 `plan_id,status,started_at,active_since,rest_until,rest_remaining_seconds,ended_at,elapsed_seconds,stop_reason,sets[]`。新建可带 `client_request_id` UUID。008 实际运动另含 `activity_type,record_date,duration_seconds,intensity,pain,notes`；不知具体时刻时 `started_at/ended_at=null`。 | 返回 `training_sessions` 行；暂停、恢复、组与休息状态持久化。羽毛球/其他只记实际日期和时长，不补造时刻或卡路里。新建重试同请求 ID，编辑带 `expected_updated_at`。 |
| 趋势 | 读取 RLS 可见的 `weights`、`training_sessions`、`meals`；网页的最近 7 天体重记录天数、最近腰围及已完成力量/羽毛球均来自实际记录。 | 缺失日期留白，计划不算完成；分页读完整目标区间。本人与伴侣分开统计，只展示当前授权可见数据。 |

`health-ai` 现有 `parse-schedule`、`estimate-meal`、`adjust-plan`、`generate-plan`、`status` 都是 `POST /functions/v1/health-ai` 的 `action`，请求体上限 16 KiB；服务端重核本人、用途同意、预算与开关。照片上传完整请求上限 5 MiB，`file` 必须是净化后的 `image/png` 且文件不超过 4 MiB；相机临时 JPEG 不能只改扩展名上传。原生 `uploadFile` 需带相同鉴权头，上传返回的 JSON 文本须解析并核对 `photo_id`。函数错误为带 HTTP 状态的 `{error:'大写错误码'}`，例如 `AUTH_REQUIRED`、`ACCOUNT_DENIED`、`ORIGIN_DENIED`、`INVALID_REQUEST`、`INVALID_PNG`、`PHOTO_NOT_FOUND`、`AI_CONSENT_REQUIRED`、`AI_BUDGET_EXCEEDED`。401/403、冲突、超时和未知发送结果不能当成功；付费请求不可自动换供应商或盲目重发。免费规则计划无需 AI 授权；付费 AI 仍须本人逐用途同意和既有预算。

其中三个易漏的请求/返回契约如下；`estimate-meal` 与 `adjust-plan` 已在上表说明：

| action | 请求 | 成功返回 |
|---|---|---|
| `parse-schedule` | `{action:'parse-schedule',raw_text,submitted_at,provider}`；原文 UTF-8 最多 3000 字节，提交时间传有效 ISO 时刻，`provider` 仅 `openai/deepseek`。 | `{draft,ai_request_id,raw_text,needs_confirmation:true,parse_version:'health-schedule-v1',submitted_at}`；草稿仍须本人逐项核对并另存。 |
| `generate-plan` | `{action:'generate-plan',job_id,provider}`；`provider` 为 `rules/openai/deepseek`，须与已有 job 绑定值一致。 | `{job_id,status,plan_id,error_code}`；本次实际完成时还可能有 `ai_request_id`（可为 `null`），重用已完成 job 时没有此字段，不能以是否存在该字段判定计划成功。 |
| `status` | `{action:'status'}`。 | `{schema_version:7,plan_provider,global_budget_configured,providers}`；每个 `openai/deepseek` 项含 `configured,model,budget_configured,health_enabled,consents,usage`，各用途同意项为 `enabled,monthly_limit_cents`，用量项为 `charged_cents,reserved_cents`。不返回全站预算数值或他人用量。 |

## 小程序网络域名与密钥边界

`src/domain.js` 限定项目 URL 为 `https://<项目编号>.supabase.co`；本项目当前公开 API 主机是 `https://wnzbtitlvteptkvwhavw.supabase.co`。项目编号和域名是公开地址，密钥值仍不写本文。下列三类主机已于 2026-10-15 在微信后台分别保存并读回；此结果不代替正式校验开启的真机请求、上传和下载：

| 小程序能力 | 当前代码对应路径 | 主机 |
|---|---|---|
| `request` | Auth `/auth/v1/*`、PostgREST 表/RPC `/rest/v1/*`、AI `/functions/v1/health-ai`、照片删除 `/functions/v1/health-photo` | `https://wnzbtitlvteptkvwhavw.supabase.co` |
| `uploadFile` | multipart PNG `POST /functions/v1/health-photo?action=upload`，文件字段 `file` | `https://wnzbtitlvteptkvwhavw.supabase.co` |
| `downloadFile` | 私有 PNG `GET /functions/v1/health-photo?action=download&photo_id=...`，带本人 JWT 和公共 `apikey`；若改用可读二进制的 `request`，归入 request 类并真机核验 | `https://wnzbtitlvteptkvwhavw.supabase.co` |

现有网页入口 `https://czechiuu.github.io/plans/` 是 GitHub Pages 前端页面，**不是原生小程序的 Auth/API/照片主机**，因此不在上表三类必需网络域名中。`shared/exercises.js` 当前三个 GIF 指向 `https://static.exercisedb.dev/media/{7I6LNUG,DOoWcnA,Zg3XY7P}.gif`，原生页面以 `<image mode="aspectFit">` 按需显示；该媒体主机仍需按 AppID/组件限制及真机核验。八个原视频入口及三个 GIF 动作保留的原视频都是 YouTube 地址，小程序只展示来源和复制入口，明确视频暂不可用，不发原生视频请求。

客户端不直访 Supabase Storage 对象路径：`health-photo` 服务端按当前权限代理，不能使用公开桶或长期签名链接。`health-cron`、service_role/secret、AI 密钥、预算管理员接口只在服务端，绝不放小程序包。浏览器的 `HEALTH_ALLOWED_ORIGINS` 是有 `Origin` 时的精确来源校验；原生请求是否带 `Origin` 以真机核对，不能为了接入放宽现有站点来源列表。

微信官方[小程序网络说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)及 [`wx.request`](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html)、[`wx.uploadFile`](https://developers.weixin.qq.com/miniprogram/dev/api/network/upload/wx.uploadFile.html)、[`wx.downloadFile`](https://developers.weixin.qq.com/miniprogram/dev/api/network/download/wx.downloadFile.html)是上线核对入口；腾讯官方的[小程序域名配置说明](https://cloud.tencent.com/document/product/269/68378)也区分 request、uploadFile、downloadFile 白名单。当前微信后台已接受并保存三类 Supabase 主机登记，没有另购域名或部署代理的必要证据。个人主体仍未备案、未认证，体验版已设置；**体验版与二维码的存在不能代替正式校验开启的双人真机网络、媒体和业务验收**，这些项目仍未执行。开发工具放宽域名校验不能代替正式版真机。三个 GIF 组件已有实现，八个视频保持来源、不下载或重新托管；逐项状态见[媒体说明](miniprogram/MEDIA.md)。

接入后按[双人真机清单](docs/DEVICE-ACCEPTANCE.md)验证两台物理设备、两份会话、共享撤销、照片私有下载、冲突和退出。测试只用精确标记的合成记录，清理按回执 ID 与所有者执行。

## 小程序页面与现有网页对应

| 原生页面 | 复用的网页模块与接口 |
|---|---|
| 登录 | 固定“我 / W”选择、Supabase Auth 密码登录、会话/槽位核对与本机退出；不接微信登录。 |
| 今日 | 网页“今日”的当前计划、日程、最近体重与本人/伴侣可见范围；读取 `daily_plans`、`schedules`、`weights`，沿用 RLS。 |
| 明日安排 | 网页“明日安排”的原文、确认结构、规则或已授权 AI 生成、job 状态与计划版本；复用日程和计划 RPC/`health-ai`。 |
| 记录 | 网页餐食、体重、羽毛球/其他实际活动表单；复用 `save_meal`、照片函数、`save_weight`、`save_training_session` 及精确创建请求 ID。 |
| 趋势 | 网页“趋势”的实际体重、腰围、训练和活动统计；只从有权读取的实际记录计算，缺失日期留白。 |
| 训练 | 网页“训练”的计划动作、逐组完成、暂停/恢复/停止；复用 `daily_plans` 与 `training_sessions`。三个 GIF 原生图片组件已实现，八个视频明确暂不可用；真机媒体仍待验。 |
| 设置 | 网页类别共享、代改许可、AI 用途同意与费用状态；复用现有设置/授权 RPC 和 `health-ai` status，不改变默认私有与预算。 |

这些映射现在已有原生页面源码。媒体详情保留三个远程 GIF，八个视频明确“暂不可用”；原生真机状态见本轮报告。现有站内刷新提示不是微信每日推送；本轮不承诺每日推送，也不接微信登录。

## 仍需本人准备的最少资料

- AppID、域名、工具登录、编译、上传和体验版设置均已核对，真实体验二维码已私有交付。免费原生验收和 3 条精确合成记录清理已经完成，结果与未完成项见[验收说明](docs/MINIAPP-ACCEPTANCE.md)。管理员手机仅反馈扫码打开、登录成功，W 和两台手机完整业务尚未验收。主体未备案、未认证，体验成员 0。隐私首轮拒绝保留，第二版审核中；待最终内容及审核生效核对后复验照片流程，再按实际需要添加体验成员并做双人真机和跨端一致性验收。不重复已完成设置；备案、认证、成员权限或正式发布另行确认，不购买服务。
- 两台真实手机与“我 / W”两位固定账号由本人分别安全登录；密码仅在各自设备输入，不发送到聊天或文档。
- 如需配置既有后端或发布体验版，由现有后端运营管理员使用自己的权限操作；service_role、cron secret 与 AI 密钥始终只在服务端。付费供应商用途只有本人明确授权且现有预算允许才启用，不代替 W 授权、不提高额度。
