# 项目状态

当前验收更新（2026-10-14）：真实双账号合成 API 业务 10 通过、0 失败，四类 DeepSeek 正式调用合计 4 美分；撤销授权、个人预算阻断与恢复的真实核验 3 通过、0 失败，未新增费用。照片修复版真实网页验收现为 6 通过、1 失败、0 阻塞：照片、动作、训练与免费边界通过，体重跨账号刷新超时待复验。08:33 单轮 UI 合成记录已精确清理，完整主清理尚未执行；实际上海 20:00 与两台物理手机尚未验收。历史失败单列保留。

更新于 2026-10-14（上海时间）。001–009、三份函数与新版网页已发布；真实 API 验收已通过，网页、清理和物理设备的结论各自独立。

| 层面 | 当前可证实状态 |
|---|---|
| 已发布版源码与持续集成 | 后端 `eea81bb`，前端 `78428fa203b2406aa5d7e33af14c5b9932036b80`；[push 构建](https://github.com/czechiuu/plans/actions/runs/38534778712)实读单元97、旧版5、健康15、服务商7、活动3、快照5，共132，失败0 |
| 生产数据库 | 001–009 已应用；006–009原文哈希回读一致，照片Storage保护触发器已存在；009私有输入快照不回填旧历史 |
| 生产三函数 | health-ai、health-photo、health-cron已部署本轮bundle，分别下载源码SHA256核对一致，见[发布记录](test-results/daily-flow-release.json) |
| Pages | 照片修复版 `78428fa` 的[测试构建与部署](https://github.com/czechiuu/plans/actions/runs/38535067353)均成功；[新版匿名页面](test-results/deployed-public-results.json) 8/0，资源 SHA 匹配 |
| 旧定时任务 | 两条旧任务均 exhausted、各尝试 3 次，错误为餐食模板未确认；生成计划 0。只读保留，不作为新版任务成功证据 |
| 月度预算 | 全站 200 美分、OpenAI 200 美分、DeepSeek 10 美分未提高；此前探针结算 5 美分，本轮正式合成调用另结算 4 美分；无活动预留 |
| 真实 API 与策略 | [双账号合成业务](test-results/daily-flow-cloud-results.json) 10/0，含规则后台领取、图片估算、餐后调整应用撤销及活动读回；[撤销与预算策略](test-results/cloud-health-policy-results.json) 3/0，已恢复验收前授权和预算，未新增费用 |
| 网页与清理 | [新版网页报告](test-results/cloud-health-ui-results.json) 6/1/0：照片、动作、训练与清理通过，体重跨账号刷新超时。[08:33 单轮 UI 清理](test-results/ui-retry-cleanup-results.json)已先回滚预演再提交，精确删除规则 1、计划 1、创建回执 2，四项回读为真；完整主清理未执行。[来源只读核验](test-results/cleanup-source-verification-results.json) 24/0，来源丢失的首轮创建回执保留 |

[发布记录](test-results/daily-flow-release.json)记录 006–009 迁移及三函数下载 SHA-256 匹配；新版前端匿名资源 SHA 已核对。发布、匿名边界、真实 API 和真实网页分别验收，不能互相代替。

本轮版本已取消“必须有三餐模板才能生成”的业务前置条件，提供标注假设的三餐及替代；仍严格核对伤情、器械、训练史与明确时间。日程、照片估算、已确认摄入、餐后建议、本人应用/撤销分别留痕。规则任务绑定 rules 后不会因偏好、重试或 cron 改成 AI。008 记录羽毛球、力量及其他实际活动，支持仅日期和实际时长，恢复判断不伪造时刻。

| 本轮证据 | 通过 / 失败 | 说明 |
|---|---:|---|
| 已发布版持续集成 | 132 / 0 | [push 构建](https://github.com/czechiuu/plans/actions/runs/38534778712)，97 单元、5 旧版、15 健康、7 服务商、3 活动、5 快照 |
| 真实 API / 策略 | 10 / 0；3 / 0 | [业务](test-results/daily-flow-cloud-results.json)、[撤销与预算](test-results/cloud-health-policy-results.json)，真实部署、两位固定账号、本轮合成数据 |
| 全套首轮（历史） | 75 / 3 | [原始 TAP](test-results/takeover-unit.tap)，保留失败 |
| 三项针对性复测（历史） | 3 / 0 | [复测](test-results/takeover-unit-recheck.tap)；两项沙箱限制与一项旧 job 夹具修复，不改写首轮结果 |
| 隔离健康并发 | 15 / 0 | [报告](test-results/integrity-health-concurrency-results.json) |
| 隔离服务商与执行包 | 7 / 0 | [报告](test-results/integrity-ai-provider-concurrency-results.json)；最终 008 包以最新报告为准 |
| 合成界面 | 22 / 0 | [报告](test-results/ui-mock-results.json)；008 后续界面验证单独记录 |
| AI 日常链路定向 | 18 / 0 | SQL、图片输入、授权重检、缓存、调整和 rules；[说明](docs/DAILY-FLOW-CHANGES.md) |
| cron 隐私 / 日期活动衔接 | 1 / 0；6 / 0 | 不与以上重复累加 |
| 发布后匿名边界 | Edge 14 / 0；`78428fa` 页面 8 / 0 | [Edge 报告](test-results/edge-public-results.json)、[网页报告](test-results/deployed-public-results.json)；匿名、未上传、未调用付费 AI |
| 真人合成业务首轮（历史） | 0 通过、1 失败、9 阻塞 | [14:29 前置报告](test-results/daily-flow-cloud-20261014T062907Z-results.json)：当时本人四项 DeepSeek 用途同意尚未保存，无业务写入或付费调用；后续正式运行已通过 10/0 |
| 真人部署界面首轮（历史） | 0 通过、1 失败、6 阻塞 | [14:29 前置报告](test-results/cloud-health-ui-20261014-1429-results.json)；后续免费网页复验另记，不是真机 |
| 真人部署界面前两轮（历史） | 各 2 通过、1 失败、4 阻塞 | [15:03](test-results/cloud-health-ui-20261014-1503-results.json)、[15:26](test-results/cloud-health-ui-20261014-1526-results.json)；照片双入口引起测试定位冲突，已修，后续失败为不同的图片读取问题 |
| 真人网页图片读取轮（历史） | 2 通过、1 失败、4 阻塞 | 16:13 照片 PNG 被按文本读取；`78428fa` 修复版的照片查看已在真实网页通过 |

真实 API 的日程→计划→照片估算→餐后调整已跑通；新版网页照片查看已通过，体重跨账号刷新待复验。实际 20:00、两台物理手机及本人真实档案导入没有完成。

历史证据单独保留：004 生产结构与历史回读 10/0，005 配置 7/0；旧 DeepSeek 固定探针最新用途覆盖 4/0、累计响应 4/1。这些历史记录不作为当前正式业务的证据；当前业务以独立的真实 API 10/0 报告为准。旧 API 11/0、旧浏览器 9/1 及首次 CRLF、401、UUID、模板错误报告均保留，不抹去历史失败。

一处动作示意 SVG 的确认错配已在源码修正，本地定向验证 3/0。修正首轮 `e6e0905` 的持续集成 96/1、另 35 项未运行，发布被阻止；随后按用户确定的方案改为三个 AscendAPI / ExerciseDB 连续 GIF 与八个原视频入口，媒体目录单测 5/0、[合成浏览器流程](test-results/frontend-exercise-media-results.json) 5/0。新媒体尚未发布，当前网站仍是 `78428fa`；旧双帧 SVG 验证不能算新媒体验收。下一步完成免费网页复验与完整主清理，再另测上海 20:00 和两台物理手机。私人档案仅本人导入核对，不写入公共报告。详见 [部署](docs/HEALTH-DEPLOY.md)与[验收清单](docs/TEST-CHECKLIST.md)。
