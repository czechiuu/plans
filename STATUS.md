# 项目状态

更新时间：2026-10-13（Asia/Shanghai）。

固定“我/W”账号版已上线，部署源码 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`。生产 003 与管理员初始化已完成；真实 API 11 通过、0 失败。浏览器已通过登录、保存刷新、共享与导出，旧报告 9 通过、1 失败；切账号退出等待时序已修复并通过受控模拟，真实复测仍待安全输入。两台物理设备未验收。

| 范围 | 实际状态 |
|---|---|
| 云项目与旧库 | 001/002 已提交并核对，结构/ACL 14 通过、0 失败；匿名拒绝 8 通过、0 失败。[结构报告](test-results/cloud-setup-results.json)、[匿名报告](test-results/cloud-anonymous-results.json)。不能代替固定账号业务检查 |
| 网页 | [固定账号版](https://czechiuu.github.io/plans/) 已发布；[运行 38393501421](https://github.com/czechiuu/plans/actions/runs/38393501421) test-build/deploy 均 success，源码 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`，74 个公开文件核对一致。[匿名发布页检查](test-results/fixed-deployment-results.json) 8 通过、0 失败；已另由真实浏览器验过两账号密码登录 |
| 固定账号方案 | 003 与管理员初始化已提交，LF 源 MD5 匹配，001/002 历史源 MD5 未变；[12 项回验](test-results/cloud-fixed-setup-results.json)通过、0 失败。本地 `pnpm test` 41 通过、0 失败 |
| Auth 配置 | 公开注册已在云端关闭并保存；Require current password when updating 已开启；Email、Confirm email 保持开启；Secure password change 保持关闭；Custom SMTP 关闭 |
| 公开注册云端检查 | 2 通过、0 失败：设置报告禁用注册，未登录注册请求被拒。[报告](test-results/cloud-auth-public-results.json)；不证明固定账号业务 |
| 两账号真实云端 API | 11 通过、0 失败：真实密码登录、固定空间、默认私有、共享与撤销、代改审计和冲突、CRUD/本轮清理。[报告](test-results/cloud-api-results.json)；不证明网页或双设备 |
| 真实网页当前 | 9 通过、1 失败、0 阻塞：[报告](test-results/cloud-browser-results.json)覆盖两账号登录、保存刷新、共享、导出及本轮合成数据清理；`E2E_SWITCH` 的退出等待时序已在测试脚本修复，受控本地[模拟回归](test-results/browser-login-race-results.json) 1 通过、0 失败；最新云报告仍为 9／1，真实复测等安全窗口输入。先前断言与凭据失败保留为历史 |
| 邮件与遗忘密码 | 本轮取消注册/重置邮件需求，不配置 SMTP，也不把投递当门槛；面板仅见恢复邮件按钮，本地管理员改密工具已编写，单测 3 通过、0 失败（含在本地 41 项内）；生产操作未执行 |
| 本地并发／未配置页／模拟界面 | 5／2／6 通过，各 0 失败；[并发](test-results/concurrency-results.json)、[未配置](test-results/unconfigured-results.json)、[模拟](test-results/ui-mock-results.json)，不算云业务 |
| 管理员清理回读 | 8 通过、0 失败：[报告](test-results/cloud-cleanup-readback-results.json)显示当前表中仅 1 空间、2 成员、2 Auth 用户、2 固定槽位，档案/日程/体重均为 0，共享/代改全关。只证明当前表状态，不证明备份擦除 |
| 人工门槛 | 邮件链路/邀请 4 项取消；后台清理回读 1 项通过；已登录改密、管理员重置、双物理设备 3 项未运行，见 [人工门槛](test-results/cloud-manual-gates.json) |
| 两台物理设备 | 未执行；模拟窗口不算真机 |

旧三账号方案已取消。旧 `.ps1` 云测入口被本机执行策略阻止，未改系统策略；Node 入口已实际运行，真实 API 通过。浏览器先前失败保留历史；退出等待时序已修复并过本地模拟；云端仍保留 9／1 的旧报告，等待真实重跑。旧邀请并发回归只证明 001/002 历史行为。详见 [验收清单](docs/TEST-CHECKLIST.md)。

接下来等待安全窗口输入并复测切账号浏览器流程，再做两台物理设备验收。生产只写合成测试记录，仅按本轮精确 ID 清理。之前不导入真实档案，不推进后续阶段。本人清除或退出不删除 Auth 账号；退出后需管理员重新关联，见 [固定账号说明](docs/FIXED-ACCOUNTS.md)。
