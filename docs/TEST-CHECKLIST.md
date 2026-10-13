# 验收清单与证据

截至2026-10-13。只统计实际执行；本地、模拟、真实云端和真机不可互相代替。新报告附时间与源码摘要，报告/截图不含密码、密钥、会话或真实健康资料。

## 本轮本地与媒体

| 运行 | 通过 | 失败 | 证据 |
|---|---:|---:|---|
| `pnpm test` | 56 | 0 | [单元/PGlite/合成Auth](../test-results/unit-results.json) |
| `pnpm test:concurrency` | 5 | 0 | [历史邀请多连接](../test-results/concurrency-results.json) |
| `pnpm test:concurrency:health` | 11 | 0 | [健康多连接](../test-results/health-concurrency-results.json) |
| 004部署包隔离PG核验 | 7 | 0 | [历史匹配/幂等/回滚](../test-results/health-migration-wrapper-results.json) |
| `pnpm test:browser:unconfigured` | 2 | 0 | [独立空配置页面](../test-results/unconfigured-results.json) |
| `pnpm test:browser:mock` | 15 | 0 | [合成界面](../test-results/ui-mock-results.json) |
| 逐个人工动作核对与嵌入播放 | 11 | 0 | [来源、许可方式及核对](EXERCISE-SOURCES.md) |

未配置测试用独立Vite子进程，明确设 `VITE_SUPABASE_URL=""` 和 `VITE_SUPABASE_PUBLISHABLE_KEY=""`，`E2E_BASE_URL` 指向该端口。模拟界面用另一进程及合成接口，不触云库。两者不能共用已配置/未配置前提。测试后关闭各自进程，未改真实配置。

本轮本地覆盖退出等待、快速切换/旧请求、日程确认、训练/休息保存、手动饮食确认与汇总、照片净化边界、AI无效输出/超时、预算并发、权限/代改、版本冲突、重试和重复发布。数据库并发用真实PostgreSQL多连接；合成图片不对真实健康图调用AI。

## 生产与真实服务

| 项目 | 本轮结果 | 方法/限制 |
|---|---|---|
| 004与三项Edge Function | 未执行 | 一次包核对历史并事务登记，回读权限/摘要 |
| `pnpm test:cloud` | 新版未执行 | 安全输入两密码；旧版[11/0](../test-results/cloud-api-results.json)不转为新版证据 |
| `pnpm test:browser:cloud` | 新版未执行 | 正式HTTPS实际构建；旧版[9/1](../test-results/cloud-browser-results.json)待复测 |
| `pnpm test:cloud:health` | 0通过、0失败、17阻塞 | [报告](../test-results/cloud-health-results.json)，缺凭据/004未部署，非零退出 |
| 照片上传/权限/删除回读 | 未执行 | 真实私有存储；直接接口本人/伴侣/匿名、撤销、去重、精确ID清理 |
| 日程→生成→次日查看→训练/餐食→趋势 | 未执行 | 最新部署与真实服务，合成输入，不改已有个人设置 |
| OpenAI真实调用 | 未配置、未执行 | 密钥/预算/本人文字与图片授权缺一即拒绝；核对用量 |
| 20:00服务端任务 | 未启用、未执行 | 浏览器全关观察应执行/开始/完成/目标日；跨午夜与独立失败另测 |
| 两台物理设备 | 未执行 | [最短步骤](DEVICE-ACCEPTANCE.md)，手机尺寸模拟不算真机 |

新增健康脚本只建本轮marker+精确ID的餐食/停止训练，不改既有规则/共享。训练用超出计划有效日期上限的合成日期，避免使真实计划过期。计划生成、共享配置、图片、AI需要独立受控验收，脚本未覆盖项记阻塞，不能把子集叫完整链路。

实际部署仍为[基础版](https://czechiuu.github.io/plans/)，[运行38393501421](https://github.com/czechiuu/plans/actions/runs/38393501421)。历史结构/注册关闭/清理报告是过去观察，不保证当前健康表为空。第三用户只用隔离合成Auth，不开放生产注册。

邮件确认、邀请、邮件找回：**需求取消**，不是通过。改密/管理员重置/双设备门槛见[报告](../test-results/cloud-manual-gates.json)。生产只按本轮标记和ID清理，不全量清空；当前表删除不等于备份擦除。

## 必须继续核对

- 相对日期按提交时上海时间，人物/日期不明须确认；伤情未知不当已康复。
- 每人每日幂等且版本保留；20:00后修改标待更新；手动/锁定/完成不被覆盖。
- 组间休息、动作、转场和热身放松均计入总时长；受控动作匹配器械，自由日/伤情/负荷遵守确定性规则。
- 草稿不入账；同餐修改不新增，摄入比例只乘一次，未知热量不当0。
- 图片每次下载鉴权；已传输字节不能追回；删除失败可重试不虚报成功。
- 体重仅真实手动记录，七日均值标样本数/缺口，无到期保证或两人排名。
- 无密钥/真实资料公开；未授权不发AI。AI、到点定时与真机未验收前不称完整版。
