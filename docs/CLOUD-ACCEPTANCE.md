# 第一阶段云端验收

当前生产已有 001/002/003 和固定账号版网页。003 与管理员初始化已提交，12 项只读回验通过；固定账号新版已发布，双账号业务验收尚未完成；结构、匿名和页面可访问不能代替它们。

| 已有证据 | 实际边界 |
|---|---|
| [001/002 结构报告](../test-results/cloud-setup-results.json) | 14 通过、0 失败；云端按序执行、历史回读及 RLS/RPC 权限 |
| [匿名拒绝报告](../test-results/cloud-anonymous-results.json) | 8 通过、0 失败；7 张表和 RPC 的匿名访问，不证明已登录共享 |
| [公开注册关闭报告](../test-results/cloud-auth-public-results.json) | 2 通过、0 失败；真实 Auth 设置与未登录注册拒绝，不证明固定账号业务 |
| [固定账号初始化报告](../test-results/cloud-fixed-setup-results.json) | 12 通过、0 失败；管理员提交 003/初始化后只读回验，不证明密码登录或共享 |
| [固定账号版部署](https://github.com/czechiuu/plans/actions/runs/38393501421) | test-build/deploy 均 success；源码 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`，74 个公开文件核对一致；[匿名发布页检查](../test-results/fixed-deployment-results.json) 8 通过、0 失败。未验证密码登录或共享 |
| [两账号真实 API](../test-results/cloud-api-results.json) | 11 通过、0 失败；真实密码登录、固定槽位/空间、默认私有、共享双开关/撤销、代改审计/冲突、真实读写与本轮清理。只测 API，不证明网页或双物理设备 |
| [真实页面当前](../test-results/cloud-browser-results.json) | 9 通过、1 失败、0 阻塞：实际登录、保存刷新、共享、导出及合成记录清理通过；`E2E_SWITCH` 切账号超时。前两轮失败 [首次](../test-results/cloud-browser-first-attempt.json)、[第二次](../test-results/cloud-browser-second-attempt.json) 与 [第三次快照](../test-results/cloud-browser-third-attempt.json) 保留 |
| [管理员清理回读](../test-results/cloud-cleanup-readback-results.json) | 8 通过、0 失败；当前档案/日程/体重均为 0，空间1、成员2、Auth2、固定槽2，共享/代改全关。只证明当前表状态，不证明备份擦除 |

公开注册已在生产 Auth 中关闭并保存；Require current password when updating 已开启。Email 与 Confirm email 保持开启、Secure password change 保持关闭，Custom SMTP 未配置。本轮取消注册/重置邮件投递要求，不把 SMTP 作为上线依赖。Site URL 为 [实际页面](https://czechiuu.github.io/plans/)，Redirect URLs 只有该入口及 `/plans/index.html`，曾保存并回读；旧 [配置报告](../test-results/cloud-auth-config-results.json) 是开关变更前快照；本轮保存并刷新后的 [Auth 设置回读](../test-results/cloud-fixed-auth-config-results.json) 独立记录新状态，不并入 SQL 12 项。

## 当前顺序

1. 管理员已在初始化前只读回验：Auth 恰好两个指定、已确认且有密码的内部账号，其他 Auth 用户、成员与健康记录均为 0；见 [状态](../STATUS.md)。
2. 管理员已按 [固定账号操作](FIXED-ACCOUNTS.md) 执行幂等初始化；[12 项只读回验](../test-results/cloud-fixed-setup-results.json)通过、0 失败，包含固定槽位、同空间两成员、共享/代改全关与旧入口关闭。不能重跑 001/002/003；结构通过不等于业务验收。
3. 固定账号新版已部署。两位本人已在交互式终端安全输入密码，真实 API 11 项通过；网页已通过登录、保存刷新、共享及导出，切账号步骤超时；受控本地时序复现 [1 通过、0 失败](../test-results/browser-login-race-results.json)，真实复测待用户安全输入。`node scripts/run-fixed-cloud-tests.mjs --browser-only` 可只复测浏览器；运行器逐一隐藏输入并验证两位密码、显示进度，只读取被 Git 忽略的 `.env.local` 中两项公共配置、校验本项目地址和 publishable key，密码不落盘；裸 `pnpm test:cloud`/`pnpm test:browser:cloud` 不会自动读 `.env.local`。本机系统策略曾拒绝旧 `.ps1` 入口，未更改策略；当次云业务未运行，不计入云端失败。必须先检查账号与原有健康记录，避免覆盖；只造带本轮唯一标记的合成记录，清理时逐行核对并按本轮记录 ID 删除，禁止全量清除。
4. 核对身份、默认私有、双方共享/撤销、代改审计、冲突、页面持久化和清理后的计数。第三人越权由本地隔离的合成 Auth 夹具验证，生产不创建第三用户。再由两人执行 [两台真实设备](DEVICE-ACCEPTANCE.md) 流程。

普通客户端查询为空只证明当前身份看不到，不能单独证明物理删除；管理员只针对本轮合成记录 ID 核对表中残留，不用无过滤的 DELETE。备份保留期限尚未核实，表中删除不等于所有备份即时消失。真实运行报告不得含密码、UUID、会话、健康原文。

| 剩余门槛 | 状态 |
|---|---|
| 两账号管理员回读、003、初始化 | 已完成；12 项结构回验通过、0 失败 |
| 固定账号新版部署 | 已发布；匿名页 8 通过，真实网页密码登录已通过 |
| 双账号真实 API/页面权限与清理 | API 11 通过、0 失败；网页 9 通过、1 失败（切账号超时），待真实复测 |
| 两台物理设备 | 未执行 |
| 已登录改密、管理员重置 | 未运行；后台清理只读回读已通过，见 [人工门槛](../test-results/cloud-manual-gates.json) |
| 忘记密码的管理员处理路径 | 面板无无邮件改密表单；本地受控管理员工具已编写，单测 3 通过、0 失败（包含在 41 项中）；生产操作未执行 |

全部关键门槛通过前不导入真实档案，不进入第二阶段。
