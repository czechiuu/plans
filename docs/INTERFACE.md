# 前端接口与页面约定

前端 `src/main.js` 使用 `src/api.js` 与 `src/domain.js`。未配置时显示错误，不造假登录或演示健康记录。生产只提供固定“我/W”入口；公开注册、建空间、邀请、加入和邮件重置不在当前界面。

`src/api.js` 导出 `configured`、`configurationError`、`api`：

- `api.session()` 返回 session/null；`api.onAuthChange(callback)` 返回 unsubscribe，回调为 `callback(session,event)`。
- `api.signIn(slot,password)` 中 `slot` 仅允许 `me`、`w`，映射到两个内部登录标识；登录后以 `current_account()` 核对槽位。 `api.currentAccount()` 返回调用者 `me`/`w`；不公开另一人 UUID。 `api.signOut()` 清本机会话。
- `api.updatePassword(currentPassword,newPassword)` 供本人已知当前密码时改密。遗忘密码由管理员在交互终端运行 `node scripts/reset-fixed-password.mjs me|w` 处理；尚未在生产执行，不承诺邮件重置。
- `api.load()` 返回 `{user,account,space,members,profile,profiles,schedules,weights,audit,range}`。退出或无成员关系时 `space=null`，数组为空；固定槽位仍可识别。`profile` 是本人档案，`profiles` 是 RLS 许可的档案；日程、体重按每页 500 全量读取，不静默截断，`range={from,to}` 为实际记录日期边界；审计仅最近 100 项元数据。
- `api.saveSettings(settings)` 接收 `{share_profile,share_schedule,share_weight,allow_partner_edit}` 布尔值，默认 false。
- `api.saveProfile(payload)` 接收 `{sex,age,height_cm,baseline_weight_kg,baseline_date,target_weight_kg,target_date,preferences,health_notes,is_shared,expected_updated_at}`；无真实数据默认值，新建时已有档案须冲突。
- `api.saveSchedule(payload,id=null)` 接收 `{user_id,record_date,raw_text,start_time,end_time,exercise_intent,fixed_arrangements,meal_conditions,constraints,is_shared,expected_updated_at}`；`exercise_intent=unknown|yes|no`。 `api.deleteSchedule(id)` 删除本人记录。
- `api.saveWeight(payload,id=null)` 接收 `{user_id,record_date,measured_at,weight_kg,waist_cm,notes,is_shared,expected_updated_at}`；`api.deleteWeight(id)`。
- `api.exportOwnData()` 导出本人档案、日程、体重和共享设置，不截断；`api.eraseOwnHealthData()` 清本人健康资料；`api.leaveSpace()` 退出并撤销关系。退出后需管理员重新关联，不删除 Auth 账号。

`space={id,name}`；`members` 只包含同空间成员的 `space_id,user_id,display_name` 与四个共享/代改开关，不含邮箱。健康表的共同字段为 `id,space_id,user_id,created_at,updated_at,updated_by`；日程另有 `version`。编辑提交 `expected_updated_at`，冲突不可静默覆盖。类别共享及单条 `is_shared` 同时开启才能让对方读；代改另需授权，不能替对方扩大共享或改身份。

`src/domain.js` 提供上海日期、日期加减、7 个自然日实际体重均值及样本数、HTML 转义、公共配置校验与本地时间转换。初始健康资料只在 Git 忽略的私人文件，经本人确认才导入。AI 是否已配置、是否授权和调用是否成功分别展示。

## 扩展健康功能

六个入口为今日、明日安排、训练、饮食、趋势和设置。浅紫灰背景、白色圆角卡片与深色标题；大屏双列、手机单列。参考图只用于布局，不复制品牌、人物素材或其中的训练内容。

新增接口以 [HEALTH-API.md](HEALTH-API.md) 为准：健康规则与分享、本人确认日程、计划生成任务/版本/锁定、训练进度、餐食草稿/确认、私人图片，以及分开的文字/图片 AI 同意。训练值与实际完成值分开保存，休息计时按服务器保存的绝对时刻恢复。估算只统计选定日期的已确认餐食，整份区间乘一次实际食用比例；未估算与未记录都不当成零。

`api.load()` 探测 `health_schema_version()`；生产未部署 004 时只在明确的缺函数响应中显示健康功能未部署，原有档案/日程/体重继续工作。新表依据 RLS 分页读取；服务端错误不得转换成假数据。

退出期间只显示等待状态。每次异步操作绑定发起时的账号/令牌；切账号后丢弃旧读取结果，清除页面中的健康内容和图片对象 URL。新的登录表单必须等退出完成才可编辑。跨设备更新由用户刷新触发，当前不宣称实时推送。
