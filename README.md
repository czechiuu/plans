# 两个人的日常

中文、手机优先的私人健康网站：[实际网站](https://czechiuu.github.io/plans/)。沿用原 Supabase 和“我 / W”两个独立密码账号；默认私有，类别共享、单条共享和代改分别由本人控制。

截至 2026-10-14，006–008 数据库迁移与三份 Edge Function 已部署并回读核对；GitHub Pages 已发布源码 `6c08c128c8ea00042b34e35b6ab974196094666c`。本轮线上检查仅覆盖匿名页面与资源，不代表两人已登录或健康业务已验收。详情见 [STATUS](STATUS.md)。

当前版本包含日程原文与结构化确认、三餐建议、受约束的训练、照片估餐草稿和独立餐后调整。未确认餐食模板也可给明确标注假设的三餐建议；伤情、器械和训练史未知时不安排力量训练。已确认力量日程保留明确时段，羽毛球不叠加力量，W 周二晚自由且周三不补偿。实际活动可只记日期与时长，不伪造开始或结束时刻。

AI 支持 OpenAI 与 DeepSeek；DeepSeek 管理员健康业务开关已按用户许可开启。两人仍须各自按服务商、按用途明确同意，图片单独授权；默认不继承、不自动切换。现月度上限为全站 200 美分、OpenAI 200 美分、DeepSeek 10 美分；启用时 DeepSeek 已计费 5 美分、活动预留 0。用户只批准本轮最多再用 5 美分的合成验收，未替两人作个人授权，正式健康调用尚未验收。

## 日常使用

1. 各自登录后，在“明日安排”写原始日程，核对日期、时间、运动类型和限制再保存；需要时明确选择规则、OpenAI 或 DeepSeek 生成次日计划，查看完整三餐和训练后再使用。后台以每天上海 20:00 为任务锚点、每五分钟领取；实际到点运行尚待验收，晚间请刷新查看任务和计划状态，不把排队当作已生成。
2. “今日”先显示拍照记餐与完整计划。照片或纯文字餐食都先核对食物、份量、油酱、剩余和实际吃掉比例；估算是范围草稿，本人确认后才计入。确认餐食后可单独请求后续餐食调整，查看建议再由本人应用或撤销，原计划和历史仍可查。
3. 力量训练在“训练”按实际逐组记录、休息、暂停或因不适停止；羽毛球等已完成运动可只填写完成日期与实际时长。计划不自动等于完成记录，趋势分别展示力量和羽毛球。
4. 新资料默认私有，共享、代改和每项 AI 用途由本人控制，可撤销。设置里先看发送范围及本月费用上限；预算不足会停止付费请求，不会自动提高额度。另一设备需刷新读取服务器最新记录，站内提示不是手机推送。

## 本地运行

需要 Node.js 22+、pnpm。复制 [.env.example](.env.example) 为被忽略的 `.env.local`，仅填两项公共配置；密码、会话、服务端密钥和私人档案不得提交。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm test:concurrency:health
pnpm test:concurrency:ai
pnpm test:concurrency:activities
pnpm build
pnpm build:edge
```

本地、隔离数据库、线上匿名页面的证据与边界见 [测试清单](docs/TEST-CHECKLIST.md)。真实双账号完整业务、实际 20:00 与两台物理设备仍未完成。

## 安全的真实验收入口

在交互终端运行 `node scripts/run-fixed-cloud-tests.mjs --daily-flow`，密码通过隐藏输入交给进程，不写命令、文件或聊天。须显式提供 `TEST_DAILY_FLOW_APPROVED=YES`；付费还须 `TEST_DAILY_FLOW_DEEPSEEK_APPROVED=YES`、部署后的管理员开关和两人本人用途授权。脚本不替本人同意，不提高预算，只处理本轮合成记录和精确 ID。两条已审核旧 job 只能经明确 UUID 白名单只读保留。详见 [日常链路契约](docs/DAILY-FLOW-CHANGES.md)。

真实私人档案由本人登录后导入、核对；初始档案不当作当天测量。估算草稿确认后才计入，漏记不等于没吃。另一设备刷新读取最新数据，站内提示不等于手机推送。

[部署](docs/HEALTH-DEPLOY.md) · [AI 数据与费用](docs/AI-CONFIG.md) · [DeepSeek](docs/DEEPSEEK.md) · [需求](docs/REQUIREMENTS.md) · [数据结构](docs/DATA-MODEL.md) · [固定账号](docs/FIXED-ACCOUNTS.md) · [动作来源](docs/EXERCISE-SOURCES.md)
