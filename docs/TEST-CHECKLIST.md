# 验收清单与证据

截至 2026-10-14，001–009、三函数与照片修复前端 `78428fa` 的 Pages 已发布；本地、隔离数据库、模拟界面、线上匿名边界、真实 API、真实网页和物理设备分别报告，不互相代替。不得把密码、令牌、密钥或私人健康内容放报告。

## 本轮证据（含发布前历史）

| 验证 | 通过 / 失败 | 证据与边界 |
|---|---:|---|
| 全套首次运行 | 75 / 3 | [原始 TAP](../test-results/takeover-unit.tap)，原失败保留 |
| 三项定向复测 | 3 / 0 | [复测 TAP](../test-results/takeover-unit-recheck.tap)；两项沙箱限制、一项过时 provider 夹具，不冒称新一轮全套通过 |
| 健康隔离 PostgreSQL | 15 / 0 | [报告](../test-results/integrity-health-concurrency-results.json)，照片生命周期、任务绑定与并发 |
| 服务商及执行包隔离 PostgreSQL | 7 / 0 | [报告](../test-results/integrity-ai-provider-concurrency-results.json)，最终 008 追加验证另记 |
| 合成网页 | 22 / 0 | [报告](../test-results/ui-mock-results.json)，008 活动界面后续另测 |
| AI 日常链路定向 | 18 / 0 | [说明](DAILY-FLOW-CHANGES.md)，SQL 调整、业务结构、图片 payload、撤销重检和缓存 |
| cron 聚合隐私 / 日期活动恢复 | 1 / 0；6 / 0 | 定向证据，不能与全套重复相加 |
| 最新发布后 CI | 单元 97 / 0、旧版 5 / 0、健康 15 / 0、服务商 7 / 0、活动 3 / 0、快照 5 / 0 | [push 构建](https://github.com/czechiuu/plans/actions/runs/38534778712)共 132 / 0；[Pages 部署](https://github.com/czechiuu/plans/actions/runs/38535067353)成功 |
| 线上匿名边界 | Edge 14 / 0、`78428fa` 网页 8 / 0 | [Edge](../test-results/edge-public-results.json)、[网页](../test-results/deployed-public-results.json)；新版资源匹配，无真人登录或健康业务 |
| 真实双账号合成 API | 10 / 0 | [业务报告](../test-results/daily-flow-cloud-results.json)；后台实际领取双人 rules、DeepSeek 四用途、照片、餐后调整应用/撤销及活动读回；正式调用共 4 美分 |
| 真实授权与预算阻断 | 3 / 0 | [策略报告](../test-results/cloud-health-policy-results.json)；撤销、个人预算、恢复隔离，授权和预算已恢复且无新增费用 |
| 真实网页新版复验 | 6 / 1，另 0 阻塞 | [当前报告](../test-results/cloud-health-ui-results.json)；照片、动作、训练、免费边界与清理通过，体重跨账号刷新超时待复验；两隔离浏览器环境，非物理手机 |
| 新动作媒体本地核验 | 目录单测 5 / 0；合成浏览器 5 / 0 | 三个 GIF 的 ID/URL/来源/许可与八个原视频入口已核对；[合成浏览器报告](../test-results/frontend-exercise-media-results.json)覆盖懒加载、加载失败与重试、显示、训练不中断。尚未在生产网站验收 |
| 清理来源只读核验 | 24 / 0 | [核验记录](../test-results/cleanup-source-verification-results.json)；恢复计划与归档 UI 回执的精确来源已证实，完整主清理仍待执行 |
| 08:33 单轮 UI 精确清理 | 4 项回读均为真 | [清理记录](../test-results/ui-retry-cleanup-results.json)；先回滚预演再提交，删除规则 1、计划 1、创建回执 2，恢复已核验基线计划；不代表完整主清理 |
| 真人业务首轮（历史） | 0 / 1，另 9 阻塞 | [14:29 原报告](../test-results/daily-flow-cloud-20261014T062907Z-results.json)；当时四项 DeepSeek 用途同意未保存，无业务写入或付费调用 |
| 真人界面首轮（历史） | 0 / 1，另 6 阻塞 | [14:29 原报告](../test-results/cloud-health-ui-20261014-1429-results.json)；前置未通过，后续未执行，非真机 |
| 真人界面前两轮（历史） | 各 2 / 1，另 4 阻塞 | [15:03](../test-results/cloud-health-ui-20261014-1503-results.json)、[15:26](../test-results/cloud-health-ui-20261014-1526-results.json)；双入口定位冲突已修；后续图片读取失败也已修，新版照片验收通过 |
| 真人界面图片读取轮（历史） | 2 / 1，另 4 阻塞 | 16:13 照片 PNG 被按文本读取；新版真实网页照片查看已通过 |
| 界面前置分类自检 | 5 / 0 | 无凭据本地 `--self-check`：缺失/陈旧前序清单归为阻塞，真实断言仍失败；未重写上方原报告 |

两类界面测试分别启动独立进程：未配置测试显式清空两个 VITE 配置，模拟测试用合成接口。图片尺寸模拟不能当作两台物理设备；PGlite 和隔离 PostgreSQL 不能当作生产部署。

## 仍需真实完成

- 真实网页复验体重跨账号刷新；照片显示、动作、训练、免费边界及清理在当前报告已通过。双重共享、代改边界和冲突另按清单核对。
- 完成尚未执行的主清理；本轮合成数据只按精确回执和所有者清理，保留旧两条 exhausted 任务及无法证明来源的旧回执；照片存储对象按精确路径核对。
- 已跑通的真实 API 链路保留报告；同源重放、配置未知和更多边界若未独立跑过，不把构建或模拟当作补证。
- 真实上海 20:00 两人独立任务、延迟跨午夜目标不变，锁定和新输入不被旧任务覆盖。
- 两台物理设备登录、记录、刷新、图片和训练使用；步骤见 [DEVICE-ACCEPTANCE](DEVICE-ACCEPTANCE.md)。

用户已批准且管理员已开启 DeepSeek 健康业务，本轮合成最多 5 美分，不提高原全站 200/供应商 DeepSeek 10 美分月度限额。四次正式合成调用分别按最多 2 美分预留核对，最终各结算 1 美分、合计 4 美分。开关不是本人授权；两人用途授权由本人控制，策略验收后已恢复验收前状态。

脚本只动本轮合成精确 ID。生产两个旧 exhausted 任务仅按明确 UUID 白名单只读核对，不能删旧 job 或误把已有私人输入当测试数据。单条餐食删除不会删除创建回执；来源丢失的首轮 UI 回执必须保留，不能凭同日或已删餐食批量推断。真实档案不用于本轮合成付费测试。

## 历史证据

004 生产结构与历史回读 10/0，005 配置 7/0；旧 API 11/0、旧浏览器 9/1。旧固定 DeepSeek 探针最新用途覆盖 4/0，累计响应 4/1，结算 5 美分；不能代替正式四用途链路。首次迁移换行、401、UUID 与模板失败报告保留。旧 cron 后续两条 exhausted、各尝试 3 次、计划 0，不是实际 20:00 成功。

邮件确认、邀请和邮件找回是已取消入口，不记为通过。构建、匿名边界或模拟登录页均不能把真实链路未运行改为完成。
