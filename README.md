# 两个人的日常

中文、手机优先的私人健康网站：[实际网站](https://czechiuu.github.io/plans/)。沿用原 Supabase 和“我 / W”两个独立密码账号；默认私有，类别共享、单条共享和代改分别由本人控制。

截至 2026-10-14，本地 006–008 与配套前后端是**未提交、未部署的候选版本**。生产数据库已到 005，三份 Edge 下载源码均匹配接管基线 `e6126bc`，Pages 为 `b55346a`。部署及验收以 [STATUS](STATUS.md) 为准；源码实现不代表线上已启用。

候选版本完成日程原文与结构化确认、三餐建议、受约束的训练、照片估餐草稿和独立餐后调整。未确认餐食模板也可给明确标注假设的三餐建议；伤情、器械和训练史未知时不安排力量训练。已确认力量日程保留明确时段，羽毛球不叠加力量，W 周二晚自由且周三不补偿。实际活动可只记日期与时长，不伪造开始或结束时刻。

AI 支持保留 OpenAI 并接入 DeepSeek 正式业务；每人、每服务商、每用途独立同意，图片另行同意，发送前复查。管理员开关与个人授权缺一不可，不自动换服务商。现月度上限为全站 200 美分、OpenAI 200 美分、DeepSeek 10 美分；DeepSeek 已计费 5 美分、活动预留 0。用户已批准启用 DeepSeek 并做本轮最多 5 美分合成验收，**批准不等于已启用或已验收**。

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

当前候选的本地、隔离数据库与模拟界面证据见 [测试清单](docs/TEST-CHECKLIST.md)。真实双账号完整业务、实际 20:00 与两台物理设备仍未完成。

## 安全的真实验收入口

在交互终端运行 `node scripts/run-fixed-cloud-tests.mjs --daily-flow`，密码通过隐藏输入交给进程，不写命令、文件或聊天。须显式提供 `TEST_DAILY_FLOW_APPROVED=YES`；付费还须 `TEST_DAILY_FLOW_DEEPSEEK_APPROVED=YES`、部署后的管理员开关和两人本人用途授权。脚本不替本人同意，不提高预算，只处理本轮合成记录和精确 ID。两条已审核旧 job 只能经明确 UUID 白名单只读保留。详见 [日常链路契约](docs/DAILY-FLOW-CHANGES.md)。

真实私人档案由本人登录后导入、核对；初始档案不当作当天测量。估算草稿确认后才计入，漏记不等于没吃。另一设备刷新读取最新数据，站内提示不等于手机推送。

[部署](docs/HEALTH-DEPLOY.md) · [AI 数据与费用](docs/AI-CONFIG.md) · [DeepSeek](docs/DEEPSEEK.md) · [需求](docs/REQUIREMENTS.md) · [数据结构](docs/DATA-MODEL.md) · [固定账号](docs/FIXED-ACCOUNTS.md) · [动作来源](docs/EXERCISE-SOURCES.md)