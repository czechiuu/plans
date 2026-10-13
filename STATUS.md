# 项目状态

更新时间：2026-10-13（Asia/Shanghai）。

第一阶段正在改为“我/W”两个固定 Supabase 密码账号。生产项目 `wnzbtitlvteptkvwhavw` 已按序应用 001/002/003，并事务执行管理员初始化；只读回验 12 通过、0 失败。结构完成不代表实际密码登录、共享或网页通过。当前发布的应用源码为 `3ded57c825fa375564d389629dd990858ebf97cf`，远端 main 起点 `952ee259161f32c5d047935b8268e3f84ab19cae`。

| 范围 | 实际状态 |
|---|---|
| 云项目与旧库 | 001/002 已提交并核对，结构/ACL 14 通过、0 失败；匿名拒绝 8 通过、0 失败。[结构报告](test-results/cloud-setup-results.json)、[匿名报告](test-results/cloud-anonymous-results.json)。不能代替固定账号业务检查 |
| 网页 | [当前旧版](https://czechiuu.github.io/plans/) 来自 [运行 38378521147](https://github.com/czechiuu/plans/actions/runs/38378521147)；图标修复后的受影响回归 4 通过、0 失败。[报告](test-results/deployment-regression-results.json) |
| 固定账号方案 | 003 与管理员初始化已提交，LF 源 MD5 匹配，001/002 历史源 MD5 未变；[12 项回验](test-results/cloud-fixed-setup-results.json)通过、0 失败。登录及共享未验收；本地 `pnpm test` 37 通过、0 失败 |
| Auth 配置 | 公开注册已在云端关闭并保存；Require current password when updating 已开启；Email、Confirm email 保持开启；Secure password change 保持关闭；Custom SMTP 关闭 |
| 公开注册云端检查 | 2 通过、0 失败：设置报告禁用注册，未登录注册请求被拒。[报告](test-results/cloud-auth-public-results.json)；不证明固定账号业务 |
| 新方案云端 API／页面脚本 | 0 通过、0 失败、11／10 阻塞；缺两位密码和已核实可运行前置条件，尚未触碰业务数据。[API](test-results/cloud-api-results.json)、[页面](test-results/cloud-browser-results.json) |
| 邮件与遗忘密码 | 本轮取消注册/重置邮件需求，不配置 SMTP，也不把投递当门槛；面板仅见恢复邮件按钮，本地管理员改密工具已编写，单测 3 通过、0 失败（含在本地 37 项内）；生产操作未执行 |
| 本地并发／未配置页／模拟界面 | 5／2／6 通过，各 0 失败；[并发](test-results/concurrency-results.json)、[未配置](test-results/unconfigured-results.json)、[模拟](test-results/ui-mock-results.json)，不算云业务 |
| 两台物理设备 | 未执行；模拟窗口不算真机 |

旧三账号方案已取消；现有云端报告已改为两固定账号，当前因缺安全输入的两位密码而阻塞。旧邀请并发回归只证明 001/002 历史行为。详见 [验收清单](docs/TEST-CHECKLIST.md)。

接下来新版发布后用两位账号做真实云端、网页和两台设备验收。生产只写合成测试记录，仅按本轮精确 ID 清理。之前不导入真实档案，不推进后续阶段。本人清除或退出不删除 Auth 账号；退出后需管理员重新关联，见 [固定账号说明](docs/FIXED-ACCOUNTS.md)。
