# 第一阶段接口约定（开发用）

前端 `src/main.js` 导入 `src/api.js` 与 `src/domain.js`。无后端配置时展示未配置页，不使用假登录或演示记录。

`src/api.js` 导出 `configured` 布尔值、`configurationError` 字符串、`api` 对象。

- `api.session()` -> session/null；`api.onAuthChange(callback)` -> unsubscribe函数，callback(session,event)，恢复密码使用PASSWORD_RECOVERY事件。
- `api.signIn(email,password)`，`api.signUp(email,password)` -> `{ needsEmailConfirmation: boolean }`；`api.signOut()`；`api.resetPassword(email)`；`api.updatePassword(password)`。
- `api.load()` -> `{ user, space, members, profile, profiles, schedules, weights, audit, range }`；未加入空间返回space=null、members/schedules/weights/audit/profiles=[]、profile=null。user是当前真实账号。profiles为RLS允许的档案，profile仍为本人档案；日程和体重全量分页不截断，range={from,to}为实际记录日期边界；audit最近100条。
- `api.createSpace(name,displayName)` -> uuid；`api.createInvite()` -> `{ token, expires_at }`；`api.joinSpace(token,displayName,settings)` -> uuid。成员唯一空间，空间最多两人，token一次使用。
- `api.saveSettings(settings)` -> void。settings=`{share_profile,share_schedule,share_weight,allow_partner_edit}`，布尔值默认false。
- `api.saveProfile(payload)` -> row；payload=`{sex,age,height_cm,baseline_weight_kg,baseline_date,target_weight_kg,target_date,preferences,health_notes,is_shared,expected_updated_at}`。所有未知项null/空；无真实数据默认值，偏好/伤情为用户原文。编辑有expected_updated_at；新建时已有档案则冲突，不静默覆盖。
- `api.saveSchedule(payload,id=null)` -> row；payload=`{user_id,record_date,raw_text,start_time,end_time,exercise_intent,fixed_arrangements,meal_conditions,constraints,is_shared}`。第一阶段结构化手动确认，不声称完成AI/NL解析。exercise_intent=`unknown|yes|no`。
- `api.deleteSchedule(id)` -> void；`api.saveWeight(payload,id=null)` -> row；payload=`{user_id,record_date,measured_at,weight_kg,waist_cm,notes,is_shared}`；`api.deleteWeight(id)`。
- `api.exportOwnData()` -> JSON对象（仅自己的档案、日程、体重、共享设置）；`api.eraseOwnHealthData()` -> void；`api.leaveSpace()` -> void。清除仅本人健康数据；退出会删除本人该空间健康记录并撤销共享，UI先导出/确认。不宣称删除Auth账号。

load中所有row具有uuid；space=`{id,name}`；members=`{space_id,user_id,display_name,share_profile,share_schedule,share_weight,allow_partner_edit}`；profile属于本人。schedules/weights仅数据库RLS允许读取的记录。共享看板只筛选这些返回结果，不在前端扩大权限。

健康表包含 `id,space_id,user_id,created_at,updated_at,updated_by`。schedule有`version`，同一人一天一条；weight同一人一天一条，每日平均以7个自然日窗口的真实记录计算，不补缺失日期。更新冲突不得悄悄覆盖：编辑时提交`expected_updated_at`，api使用条件更新并返回冲突错误。

`src/domain.js` 导出：`shanghaiDate(instant=new Date())`、`addDays(yyyyMMdd,n)`、`sevenDayAverage(rows,endDate)` -> `{average,count,startDate,endDate}`（weight_kg非空真实记录）；`escapeHtml(value)`；`validateConfig(url,key)` -> `{configured,error}`；`localDateTimeToInstant(local)`；`instantToLocalDateTime(iso)`。日期不使用宿主时区。

真实初始档案仅存于git忽略的private/文件，通过本人导入、核对后才保存云端，公开代码无预设个人数据。AI处理尚未启用且不向外部AI发送资料。
