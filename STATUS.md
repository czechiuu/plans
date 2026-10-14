# 项目状态

更新于 2026-10-14（上海时间）。后台与网页均已发布；真实双账号业务仍待安全登录后单独验收。

| 层面 | 当前可证实状态 |
|---|---|
| 源码与持续集成 | 原 main 为 `6c08c128c8ea00042b34e35b6ab974196094666c`；[CI](https://github.com/czechiuu/plans/actions/runs/38516484426) 实际日志：单元82、健康15、服务商7、活动3，均0失败、0未运行；手机端最后定向5/0 |
| 生产数据库 | 001–009 已应用；006–009原文哈希回读一致，照片Storage保护触发器已存在；009私有输入快照不回填旧历史 |
| 生产三函数 | health-ai、health-photo、health-cron已部署本轮bundle，分别下载源码SHA256核对一致，见[发布记录](test-results/daily-flow-release.json) |
| Pages | [发布任务](https://github.com/czechiuu/plans/actions/runs/38516977520)两项任务成功；线上匿名页面与资源[8/0](test-results/deployed-public-results.json)，来源为本轮 `6c08c12` |
| 旧定时任务 | 两条旧任务均 exhausted、各尝试 3 次，错误为餐食模板未确认；生成计划 0。只读保留，不作为新版任务成功证据 |
| 月度预算 | 全站 200 美分、OpenAI 200 美分、DeepSeek 10 美分；DeepSeek 已用 5 美分、活动预留 0 |
| 本轮用户许可 | 已批准且已开启 DeepSeek 健康业务开关，最多 5 美分合成验收、不提高原预算；开启时本人用途同意为0条，安全登录与真实调用仍待本人操作 |

[发布记录](test-results/daily-flow-release.json)现已汇总数据库、三函数、Pages 成功及匿名页面 8/0、Edge 14/0；这些仍只证明发布和匿名边界。

本轮版本已取消“必须有三餐模板才能生成”的业务前置条件，提供标注假设的三餐及替代；仍严格核对伤情、器械、训练史与明确时间。日程、照片估算、已确认摄入、餐后建议、本人应用/撤销分别留痕。规则任务绑定 rules 后不会因偏好、重试或 cron 改成 AI。008 记录羽毛球、力量及其他实际活动，支持仅日期和实际时长，恢复判断不伪造时刻。

| 本轮证据 | 通过 / 失败 | 说明 |
|---|---:|---|
| 全套首轮 | 75 / 3 | [原始 TAP](test-results/takeover-unit.tap)，保留失败 |
| 三项针对性复测 | 3 / 0 | [复测](test-results/takeover-unit-recheck.tap)；两项沙箱限制与一项旧 job 夹具修复，不能改写首轮为全套通过 |
| 隔离健康并发 | 15 / 0 | [报告](test-results/integrity-health-concurrency-results.json) |
| 隔离服务商与执行包 | 7 / 0 | [报告](test-results/integrity-ai-provider-concurrency-results.json)；最终 008 包以最新报告为准 |
| 合成界面 | 22 / 0 | [报告](test-results/ui-mock-results.json)；008 后续界面验证单独记录 |
| AI 日常链路定向 | 18 / 0 | SQL、图片输入、授权重检、缓存、调整和 rules；[说明](docs/DAILY-FLOW-CHANGES.md) |
| cron 隐私 / 日期活动衔接 | 1 / 0；6 / 0 | 不与以上重复累加 |
| 发布后匿名边界 | Edge 14 / 0；页面 8 / 0 | [Edge 报告](test-results/edge-public-results.json)、[网页报告](test-results/deployed-public-results.json)；均未登录、未上传、未调用付费 AI |

真实云端完整日程→计划→照片→餐后调整、实际 20:00、两台物理设备均未跑。合成接口、图片尺寸模拟、构建和公开登录页不能替代。

历史证据单独保留：004 生产结构与历史回读 10/0，005 配置 7/0；旧 DeepSeek 固定探针最新用途覆盖 4/0、累计响应 4/1。这些不证明当前正式业务已通过。旧 API 11/0、旧浏览器 9/1及首次 CRLF、401、UUID、模板错误报告均保留，不抹去历史失败。

下一步由两位本人通过安全入口登录、核对各用途授权后，按已批准范围进行合成真实业务验收；实际上海 20:00 与两台物理设备另测。私人档案仅本人导入核对，不写入公共报告。详见 [部署](docs/HEALTH-DEPLOY.md)与[验收清单](docs/TEST-CHECKLIST.md)。
