# 验收清单与证据

原生微信本轮：见 [独立测试/接入报告](MINIAPP-ACCEPTANCE.md)与[机器证据](../test-results/miniapp-acceptance-20261014.json)。自动化 wx 回调不等于微信开发工具，开发工具不等于两台真机；用户尚未注册，AppID/正式域名/真机/体验二维码均未验证。旧网页/自然定时/GIF 报告继续保留，不重写为原生通过。

截至 2026-10-14，001–009、三函数与三个 GIF / 八视频前端 `da20689` 的 Pages 已发布；本地、隔离数据库、模拟界面、线上匿名边界、真实 API、真实网页和物理设备分别报告，不互相代替。不得把密码、令牌、密钥或私人健康内容放报告。

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
| 最新发布后 CI | 单元 101 / 0、并发 35 / 0 | [push 构建](https://github.com/czechiuu/plans/actions/runs/38545425365)与 [Pages 测试及部署](https://github.com/czechiuu/plans/actions/runs/38545984882)均实读 136 / 0，未运行 0 |
| 线上匿名边界 | Edge 14 / 0、`da20689` 网页 8 / 0 | [Edge](../test-results/edge-public-results.json)、[新版网页](../test-results/deployed-public-results.json)；线上与 dist 资源 SHA 匹配，无真人登录或健康业务 |
| 真实双账号合成 API | 10 / 0 | [业务报告](../test-results/daily-flow-cloud-results.json)；后台实际领取双人 rules、DeepSeek 四用途、照片、餐后调整应用/撤销及活动读回；正式调用共 4 美分 |
| 真实授权与预算阻断 | 3 / 0 | [策略报告](../test-results/cloud-health-policy-results.json)；撤销、个人预算、恢复隔离，授权和预算已恢复且无新增费用 |
| 最终真实整轮网页 | 6 / 1，另 0 阻塞 | [10:12:16 归档报告](../test-results/cloud-health-ui-20261014-1812-results.json)；唯一媒体断言在 GIF 加载完成前抢跑，原失败保留；独立真实生命周期 3/0 不改写整轮结果，非物理手机 |
| 10:05 前置轮（历史） | 1 / 1，另 5 阻塞 | preflight TimeoutError，未到业务、无新测试数据；原失败保留 |
| 旧发布版真实网页（历史） | 5 / 2，另 0 阻塞 | [09:31:50 归档报告](../test-results/cloud-health-ui-20261014-1731-results.json)；隐藏设置定位和 GIF 媒体失败，不改写原结果 |
| 真实网页上一版（历史） | 6 / 1，另 0 阻塞 | [08:33 报告](../test-results/cloud-health-ui-20261014-1633-results.json)；照片、动作、训练、免费边界与清理通过，体重跨账号刷新超时；不改写原结果 |
| 新动作媒体本地核验 | 目录单测 5 / 0；合成浏览器 6 / 0 | 三个 GIF 的 ID/URL/来源/许可与八个原视频入口已核对；[合成浏览器报告](../test-results/frontend-exercise-media-results.json)覆盖懒加载、加载失败与重试、显示、计划动作折叠和训练不中断 |
| 新动作媒体实际线上定向核验 | 7 / 0 | [IAB 报告](../test-results/exercise-gif-iab-results.json)：390×844 三个指定 GIF 完整加载、原/显示尺寸均180×180、打开收起正常；有计划展开其他动作后11个ID唯一、八个原视频链接逐项一致、文档宽375≤390。另有[免登录真实生命周期](../test-results/frontend-gif-lifecycle-results.json) 3/0；未逐个在手机播放八段视频，本机私有截图留存 |
| 清理来源只读核验 | 24 / 0 | [核验记录](../test-results/cleanup-source-verification-results.json)；恢复计划与归档 UI 回执的精确来源已证实 |
| 08:33 单轮 UI 精确清理（历史） | 4 项回读均为真 | [清理记录](../test-results/ui-retry-cleanup-results.json)；先回滚预演再提交，删除规则 1、计划 1、创建回执 2；与后续主清理分别记录 |
| 最终本轮合成目标清理 | 隔离回归 7 / 0 | [生产提交与回读](../test-results/final-synthetic-cleanup-results.json)：主清理先回滚预演后提交；独立基线测试计划经原子守卫提交，两者回读通过。精确删计划6、任务3、调整1、AI缓存4、规则1、创建回执4；目标owner API记录、照片Storage对象、任务输入快照均剩0。规则更新时间一致才删除，受保护行整行比较未变；未知来源回执1条保留。[预演失败](../test-results/cleanup-preview-20261014-failure.json)与[来源失败](../test-results/cleanup-preview-20261014-source-failure.json)仍保留历史 |
| 真人业务首轮（历史） | 0 / 1，另 9 阻塞 | [14:29 原报告](../test-results/daily-flow-cloud-20261014T062907Z-results.json)；当时四项 DeepSeek 用途同意未保存，无业务写入或付费调用 |
| 真人界面首轮（历史） | 0 / 1，另 6 阻塞 | [14:29 原报告](../test-results/cloud-health-ui-20261014-1429-results.json)；前置未通过，后续未执行，非真机 |
| 真人界面前两轮（历史） | 各 2 / 1，另 4 阻塞 | [15:03](../test-results/cloud-health-ui-20261014-1503-results.json)、[15:26](../test-results/cloud-health-ui-20261014-1526-results.json)；双入口定位冲突已修；后续图片读取失败也已修，新版照片验收通过 |
| 真人界面图片读取轮（历史） | 2 / 1，另 4 阻塞 | 16:13 照片 PNG 被按文本读取；新版真实网页照片查看已通过 |
| 界面前置分类自检 | 5 / 0 | 无凭据本地 `--self-check`：缺失/陈旧前序清单归为阻塞，真实断言仍失败；未重写上方原报告 |

两类界面测试分别启动独立进程：未配置测试显式清空两个 VITE 配置，模拟测试用合成接口。图片尺寸模拟不能当作两台物理设备；PGlite 和隔离 PostgreSQL 不能当作生产部署。

## 仍需真实完成

- 真实整轮已停止重试，安全窗口关闭；6/1 原结果保留。三个 GIF 的定向线上显示与窄屏、无账号真实生命周期已核对；八段原视频尚未逐个手机播放。双重共享、代改边界和冲突另按清单核对。
- 已跑通的真实 API 链路保留报告；同源重放、配置未知和更多边界若未独立跑过，不把构建或模拟当作补证。
- 真实上海 20:00 两人独立任务、延迟跨午夜目标不变，锁定和新输入不被旧任务覆盖。
- 两台物理设备登录、记录、刷新、图片和训练使用；步骤见 [DEVICE-ACCEPTANCE](DEVICE-ACCEPTANCE.md)。

用户已批准且管理员已开启 DeepSeek 健康业务，本轮合成最多 5 美分，不提高原全站 200/供应商 DeepSeek 10 美分月度限额。四次正式合成调用分别按最多 2 美分预留核对，最终各结算 1 美分、合计 4 美分。开关不是本人授权；两人用途授权由本人控制，策略验收后已恢复验收前状态。

脚本只动本轮合成精确 ID。生产两个旧 exhausted 任务仅按明确 UUID 白名单只读核对，不能删旧 job 或误把已有私人输入当测试数据。单条餐食删除不会删除创建回执；来源丢失的首轮 UI 回执必须保留，不能凭同日或已删餐食批量推断。真实档案不用于本轮合成付费测试。

## 历史证据

004 生产结构与历史回读 10/0，005 配置 7/0；旧 API 11/0、旧浏览器 9/1。旧固定 DeepSeek 探针最新用途覆盖 4/0，累计响应 4/1，结算 5 美分；不能代替正式四用途链路。首次迁移换行、401、UUID 与模板失败报告保留。旧 cron 后续两条 exhausted、各尝试 3 次、计划 0，不是实际 20:00 成功。

邮件确认、邀请和邮件找回是已取消入口，不记为通过。构建、匿名边界或模拟登录页均不能把真实链路未运行改为完成。
