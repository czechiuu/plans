# 项目状态

本轮稳定版正在验证和发布（2026-10-14晚）。体重入口合成手机验证3/0，任务领取服务商竞争、A→B→A发布及DeepSeek正式/探针混合预算已修复；010尚待实际部署回读。`MINIAPP_HANDOFF.md`及`docs/DEVICE-ACCEPTANCE.md`已整理现有接口和实际域名。以下旧版本证据保持原样，不作为本轮新版本通过证明。上海20:00尚未到，真实定时验收待执行；本轮新增付费AI调用0。

当前验收更新（2026-10-14）：真实双账号合成 API 业务 10 通过、0 失败，四类 DeepSeek 正式调用合计 4 美分；撤销授权、个人预算阻断与恢复的真实核验 3 通过、0 失败，未新增费用。`da20689` 已发布，线上 IAB 媒体 7/0、三个指定 GIF 完整显示并可收起，八个原视频 href 一致但未逐个手机播放。10:12:16 最终真实整轮网页 6/1/0，唯一媒体断言抢在 GIF 加载完成前；独立真实生命周期 3/0，原失败不改写，也不再重跑。10:05 前置 1/1/5、09:31 旧版 5/2/0 与更早 6/1/0 均保留历史。本轮有凭据的合成目标已精确清理并回读，来源不明的旧创建回执 1 条保留；实际上海 20:00 与两台物理手机尚未验收。

更新于 2026-10-14（上海时间）。001–009、三份函数与三个 GIF 网页版已发布；真实 API 验收已通过，网页、清理和物理设备的结论各自独立。

| 层面 | 当前可证实状态 |
|---|---|
| 已发布版源码与持续集成 | 后端 `eea81bb`，前端 `da20689ebe98e4815fbe0cf5b402f4d401e2fa40`；[push 构建](https://github.com/czechiuu/plans/actions/runs/38545425365)与 Pages 测试实读单元101、并发35，共136，失败0、未运行0 |
| 生产数据库 | 001–009 已应用；006–009原文哈希回读一致，照片Storage保护触发器已存在；009私有输入快照不回填旧历史 |
| 生产三函数 | health-ai、health-photo、health-cron已部署本轮bundle，分别下载源码SHA256核对一致，见[发布记录](test-results/daily-flow-release.json) |
| Pages | 三 GIF / 八视频版 `da20689` 的[测试构建与部署](https://github.com/czechiuu/plans/actions/runs/38545984882)均成功；[新版匿名页面报告](test-results/deployed-public-results.json)为 8/0，线上与 dist 资源 SHA 匹配 |
| 旧定时任务 | 两条旧任务均 exhausted、各尝试 3 次，错误为餐食模板未确认；生成计划 0。只读保留，不作为新版任务成功证据 |
| 月度预算 | 全站 200 美分、OpenAI 200 美分、DeepSeek 10 美分未提高；此前探针结算 5 美分，本轮正式合成调用另结算 4 美分；无活动预留 |
| 真实 API 与策略 | [双账号合成业务](test-results/daily-flow-cloud-results.json) 10/0，含规则后台领取、图片估算、餐后调整应用撤销及活动读回；[撤销与预算策略](test-results/cloud-health-policy-results.json) 3/0，已恢复验收前授权和预算，未新增费用 |
| 网页与清理 | [10:12:16 最终真实整轮](test-results/cloud-health-ui-20261014-1812-results.json) 6/1/0：媒体断言抢跑，原失败保留；[同Chrome免登录GIF生命周期](test-results/frontend-gif-lifecycle-results.json) 3/0、[IAB媒体](test-results/exercise-gif-iab-results.json) 7/0。安全窗口已关闭，不再重跑。[09:31旧版](test-results/cloud-health-ui-20261014-1731-results.json) 5/2/0、[更早](test-results/cloud-health-ui-20261014-1633-results.json) 6/1/0 保留历史。[最终合成清理](test-results/final-synthetic-cleanup-results.json)已提交并回读，有凭据的目标剩 0；来源不明的首轮回执 1 条保留 |

[发布记录](test-results/daily-flow-release.json)记录 006–009 迁移及三函数下载 SHA-256 匹配；新 GIF 版前端匿名资源 SHA 已核对。发布、匿名边界、真实 API 和真实网页分别验收，不能互相代替。

本轮版本已取消“必须有三餐模板才能生成”的业务前置条件，提供标注假设的三餐及替代；仍严格核对伤情、器械、训练史与明确时间。日程、照片估算、已确认摄入、餐后建议、本人应用/撤销分别留痕。规则任务绑定 rules 后不会因偏好、重试或 cron 改成 AI。008 记录羽毛球、力量及其他实际活动，支持仅日期和实际时长，恢复判断不伪造时刻。

| 本轮证据 | 通过 / 失败 | 说明 |
|---|---:|---|
| 已发布版持续集成 | 136 / 0 | [push 构建](https://github.com/czechiuu/plans/actions/runs/38545425365)与 [Pages 测试](https://github.com/czechiuu/plans/actions/runs/38545984882)均实读101单元、35并发，未运行0 |
| 真实 API / 策略 | 10 / 0；3 / 0 | [业务](test-results/daily-flow-cloud-results.json)、[撤销与预算](test-results/cloud-health-policy-results.json)，真实部署、两位固定账号、本轮合成数据 |
| 全套首轮（历史） | 75 / 3 | [原始 TAP](test-results/takeover-unit.tap)，保留失败 |
| 三项针对性复测（历史） | 3 / 0 | [复测](test-results/takeover-unit-recheck.tap)；两项沙箱限制与一项旧 job 夹具修复，不改写首轮结果 |
| 隔离健康并发 | 15 / 0 | [报告](test-results/integrity-health-concurrency-results.json) |
| 隔离服务商与执行包 | 7 / 0 | [报告](test-results/integrity-ai-provider-concurrency-results.json)；最终 008 包以最新报告为准 |
| 合成界面 | 22 / 0 | [报告](test-results/ui-mock-results.json)；008 后续界面验证单独记录 |
| AI 日常链路定向 | 18 / 0 | SQL、图片输入、授权重检、缓存、调整和 rules；[说明](docs/DAILY-FLOW-CHANGES.md) |
| cron 隐私 / 日期活动衔接 | 1 / 0；6 / 0 | 不与以上重复累加 |
| 发布后匿名边界 | Edge 14 / 0；`da20689` 页面 8 / 0 | [Edge 报告](test-results/edge-public-results.json)、[新版网页报告](test-results/deployed-public-results.json)；匿名、未上传、未调用付费 AI，线上与 dist 资源 SHA 匹配 |
| 当前发布版媒体定向核验 | 7 / 0 | [实际线上 IAB 报告](test-results/exercise-gif-iab-results.json)：390×844 三个 GIF 显示与收起、八个原视频 href 均符合预期；有计划时展开其他动作后11个ID唯一；三图原尺寸与显示均 180×180，全部收起后图片0，文档宽375≤390；本机私有截图留存，八视频未逐个手机播放 |
| 最终真实整轮网页 | 6 / 1，另 0 阻塞 | [10:12:16 归档报告](test-results/cloud-health-ui-20261014-1812-results.json)；唯一媒体断言在 naturalWidth=180、complete=false 时抢跑，独立真实生命周期 3/0 证实最终三图均 load、complete=true；不把独立验证累加改写整轮结果 |
| 最终合成清理 | 隔离回归 7 / 0 | [生产提交与回读](test-results/final-synthetic-cleanup-results.json)：主清理先回滚预演后提交；独立基线测试计划经原子守卫提交，两者回读通过。精确删除计划 6、任务 3、调整 1、AI 缓存 4、规则 1、创建回执 4，目标 owner API 记录、照片 Storage 对象、任务输入快照均剩 0。规则仅在更新时间一致时删除；旧两条任务、计费账本、本人授权及预算设置未变。来源不明的旧回执 1 条保留；[预演失败](test-results/cleanup-preview-20261014-failure.json)和[来源核验失败](test-results/cleanup-preview-20261014-source-failure.json)保留历史 |
| 10:05 前置轮（历史） | 1 / 1，另 5 阻塞 | preflight TimeoutError，未到业务、无新测试数据；原失败保留 |
| 旧发布版真人网页（历史） | 5 / 2，另 0 阻塞 | [09:31:50 归档报告](test-results/cloud-health-ui-20261014-1731-results.json)；隐藏设置定位与 GIF 媒体失败，修复版后续整轮6/1另记 |
| 上一版真人网页（历史） | 6 / 1，另 0 阻塞 | [08:33 报告](test-results/cloud-health-ui-20261014-1633-results.json)；当时体重跨账号刷新超时，不改写原结果 |
| 真人合成业务首轮（历史） | 0 通过、1 失败、9 阻塞 | [14:29 前置报告](test-results/daily-flow-cloud-20261014T062907Z-results.json)：当时本人四项 DeepSeek 用途同意尚未保存，无业务写入或付费调用；后续正式运行已通过 10/0 |
| 真人部署界面首轮（历史） | 0 通过、1 失败、6 阻塞 | [14:29 前置报告](test-results/cloud-health-ui-20261014-1429-results.json)；后续免费网页复验另记，不是真机 |
| 真人部署界面前两轮（历史） | 各 2 通过、1 失败、4 阻塞 | [15:03](test-results/cloud-health-ui-20261014-1503-results.json)、[15:26](test-results/cloud-health-ui-20261014-1526-results.json)；照片双入口引起测试定位冲突，已修，后续失败为不同的图片读取问题 |
| 真人网页图片读取轮（历史） | 2 通过、1 失败、4 阻塞 | 16:13 照片 PNG 被按文本读取；`78428fa` 修复版的照片查看已在真实网页通过 |

真实 API 的日程→计划→照片估算→餐后调整已跑通；当前发布版定向媒体 7/0，最终整轮网页 6/1 原样保留，测试等待条件的修正不触发整轮重跑。安全窗口已关闭，内存密码已释放。实际 20:00、两台物理手机及本人真实档案导入没有完成。

历史证据单独保留：004 生产结构与历史回读 10/0，005 配置 7/0；旧 DeepSeek 固定探针最新用途覆盖 4/0、累计响应 4/1。这些历史记录不作为当前正式业务的证据；当前业务以独立的真实 API 10/0 报告为准。旧 API 11/0、旧浏览器 9/1 及首次 CRLF、401、UUID、模板错误报告均保留，不抹去历史失败。

一处动作示意 SVG 的确认错配已在源码修正，本地定向验证 3/0。修正首轮 `e6e0905` 的[持续集成报告](test-results/daily-flow-ci-e6e0905-failed.json)为 96/1、另 35 项未运行，发布被阻止；随后按用户确定的方案改为三个 AscendAPI / ExerciseDB 连续 GIF 与八个原视频入口，媒体目录单测 5/0、[合成浏览器流程](test-results/frontend-exercise-media-results.json) 6/0。当前 `da20689` 已发布，三个 GIF 实际线上显示/收起、八个原视频 href 及其他动作折叠已定向核对；旧双帧 SVG 验证不能算新媒体验收。本轮有凭据的合成记录已精确清理，保护行整行比较未变；无法证明来源的旧回执 1 条保留。另测上海 20:00 和两台物理手机。私人档案仅本人导入核对，不写入公共报告。详见 [部署](docs/HEALTH-DEPLOY.md)与[验收清单](docs/TEST-CHECKLIST.md)。
