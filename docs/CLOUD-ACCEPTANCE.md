# 第一阶段云端验收

当前生产已有 001/002/003 和旧版网页。003 与管理员初始化已提交，12 项只读回验通过；新版发布与双账号业务验收尚未完成；结构、匿名和页面可访问不能代替它们。

| 已有证据 | 实际边界 |
|---|---|
| [001/002 结构报告](../test-results/cloud-setup-results.json) | 14 通过、0 失败；云端按序执行、历史回读及 RLS/RPC 权限 |
| [匿名拒绝报告](../test-results/cloud-anonymous-results.json) | 8 通过、0 失败；7 张表和 RPC 的匿名访问，不证明已登录共享 |
| [公开注册关闭报告](../test-results/cloud-auth-public-results.json) | 2 通过、0 失败；真实 Auth 设置与未登录注册拒绝，不证明固定账号业务 |
| [固定账号初始化报告](../test-results/cloud-fixed-setup-results.json) | 12 通过、0 失败；管理员提交 003/初始化后只读回验，不证明密码登录或共享 |
| [旧版网页报告](../test-results/deployment-regression-results.json) | 受影响回归 4 通过、0 失败；运行 [38378521147](https://github.com/czechiuu/plans/actions/runs/38378521147) 部署应用源码 `3ded57c825fa375564d389629dd990858ebf97cf`，不是固定账号新版 |
| [新两账号 API](../test-results/cloud-api-results.json) / [新页面](../test-results/cloud-browser-results.json) | 当前 0 通过、0 失败、11／10 阻塞；尚未运行真实业务，不得当作通过 |

公开注册已在生产 Auth 中关闭并保存；Require current password when updating 已开启。Email 与 Confirm email 保持开启、Secure password change 保持关闭，Custom SMTP 未配置。本轮取消注册/重置邮件投递要求，不把 SMTP 作为上线依赖。Site URL 为 [实际页面](https://czechiuu.github.io/plans/)，Redirect URLs 只有该入口及 `/plans/index.html`，曾保存并回读；旧 [配置报告](../test-results/cloud-auth-config-results.json) 是开关变更前快照；本轮保存并刷新后的 [Auth 设置回读](../test-results/cloud-fixed-auth-config-results.json) 独立记录新状态，不并入 SQL 12 项。

## 当前顺序

1. 管理员已在初始化前只读回验：Auth 恰好两个指定、已确认且有密码的内部账号，其他 Auth 用户、成员与健康记录均为 0；见 [状态](../STATUS.md)。
2. 管理员已按 [固定账号操作](FIXED-ACCOUNTS.md) 执行幂等初始化；[12 项只读回验](../test-results/cloud-fixed-setup-results.json)通过、0 失败，包含固定槽位、同空间两成员、共享/代改全关与旧入口关闭。不能重跑 001/002/003；结构通过不等于业务验收。
3. 部署固定账号新版。用两位真实账号在实际 Supabase 运行 `pnpm test:cloud` 和已发布页面的 `pnpm test:browser:cloud`。脚本要求当前进程中的公共项目配置、`TEST_ME_PASSWORD`、`TEST_W_PASSWORD`、`TEST_FIXED_ACCOUNTS_APPROVED=YES`，浏览器脚本另需 `E2E_BASE_URL`。密码安全输入且不落盘，脚本不会自动读 `.env.local`。必须先检查账号与原有健康记录，避免覆盖；只造带本轮唯一标记的合成记录，清理时逐行核对并按本轮记录 ID 删除，禁止全量清除。
4. 核对身份、默认私有、双方共享/撤销、代改审计、冲突、页面持久化和清理后的计数。第三人越权由本地隔离的合成 Auth 夹具验证，生产不创建第三用户。再由两人执行 [两台真实设备](DEVICE-ACCEPTANCE.md) 流程。

普通客户端查询为空只证明当前身份看不到，不能单独证明物理删除；管理员只针对本轮合成记录 ID 核对表中残留，不用无过滤的 DELETE。备份保留期限尚未核实，表中删除不等于所有备份即时消失。真实运行报告不得含密码、UUID、会话、健康原文。

| 剩余门槛 | 状态 |
|---|---|
| 两账号管理员回读、003、初始化 | 已完成；12 项结构回验通过、0 失败 |
| 固定账号新版部署 | 未执行 |
| 双账号真实 API/页面权限与清理 | 未运行 |
| 两台物理设备 | 未执行 |
| 忘记密码的管理员处理路径 | 面板无无邮件改密表单；本地受控管理员工具已编写，单测 3 通过、0 失败（包含在 37 项中）；生产操作未执行 |

全部关键门槛通过前不导入真实档案，不进入第二阶段。
