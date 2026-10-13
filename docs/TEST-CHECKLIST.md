# 第一阶段验收清单与证据

截至 2026-10-13（Asia/Shanghai）。通过只记实际执行；模拟、本地、结构、匿名、云端业务和真机分别统计，不能相互替代。固定账号方案本地与真实 API 已有报告；浏览器最终复测仍待安全输入。

| 环境/项目 | 当前结果 | 证据及边界 |
|---|---|---|
| 本地单元、PGlite/合成 Auth | 41 通过、0 失败 | [unit-results.json](../test-results/unit-results.json)；含固定账号、管理员改密 3 项及 API 竞态 3 项，后两者均包含在 41 中；第三账号隔离只在本地合成夹具验证 |
| 本地 PostgreSQL 多连接 | 历史 001/002 回归 5 通过、0 失败 | [concurrency-results.json](../test-results/concurrency-results.json)，不等于生产 003 |
| 未配置页浏览器 | 2 通过、0 失败 | [unconfigured-results.json](../test-results/unconfigured-results.json) |
| 合成界面 | 6 通过、0 失败 | [ui-mock-results.json](../test-results/ui-mock-results.json)，模拟水印，不算真实云端 |
| 云端 001/002 结构与权限 | 14 通过、0 失败 | [cloud-setup-results.json](../test-results/cloud-setup-results.json) |
| 真实云端匿名拒绝 | 8 通过、0 失败 | [cloud-anonymous-results.json](../test-results/cloud-anonymous-results.json) |
| 真实云端公开注册关闭 | 2 通过、0 失败 | [cloud-auth-public-results.json](../test-results/cloud-auth-public-results.json)，不证明固定账号业务 |
| Auth 配置保存与刷新后回读 | 配置已确认；不计入测试通过数 | [cloud-fixed-auth-config-results.json](../test-results/cloud-fixed-auth-config-results.json)：注册/匿名关闭、Email/确认开启、改密需当前密码开启；与 SQL 12 项分开 |
| 固定账号版部署/匿名页 | 8 通过、0 失败 | [fixed-deployment-results.json](../test-results/fixed-deployment-results.json)，[运行 38393501421](https://github.com/czechiuu/plans/actions/runs/38393501421) 成功；桌面/手机匿名页、资源与运行错误，不含密码登录 |
| 旧三账号 API/页面 | 上一方案退出当前门槛 | 现有云端脚本和报告已改为两固定账号；不沿用旧统计 |
| 生产 003/管理员初始化 | 12 通过、0 失败 | [cloud-fixed-setup-results.json](../test-results/cloud-fixed-setup-results.json)：两指定账号同一空间、默认共享/代改全关；只证明结构和初始化 |
| 两固定账号真实云端 API | 11 通过、0 失败 | [cloud-api-results.json](../test-results/cloud-api-results.json)，真实密码/空间、私有/共享/撤销、代改审计/冲突及合成数据清理；不含网页 |
| 真实网页当前 | 9 通过、1 失败、0 阻塞 | [cloud-browser-results.json](../test-results/cloud-browser-results.json)：实际登录、保存刷新、共享、导出、清理通过；`E2E_SWITCH` 切账号超时。前两轮失败见 [首次](../test-results/cloud-browser-first-attempt.json)、[第二次](../test-results/cloud-browser-second-attempt.json)，第三次 [快照](../test-results/cloud-browser-third-attempt.json)；受控本地 [时序复现](../test-results/browser-login-race-results.json) 1 通过、0 失败，不代替真实复测 |
| 管理员清理回读 | 8 通过、0 失败 | [cloud-cleanup-readback-results.json](../test-results/cloud-cleanup-readback-results.json)：当前空间1、成员2、Auth2、固定槽2，健康三表0、共享/代改全关；不证明备份擦除 |
| 人工验收门槛 | 邮件/邀请 4 项取消；后台清理回读 1 项通过；改密、管理员重置、双物理设备 3 项未运行 | [人工门槛](../test-results/cloud-manual-gates.json)；双设备按[流程](DEVICE-ACCEPTANCE.md)执行 |

当前线上 [GitHub Pages](https://czechiuu.github.io/plans/) 是固定账号版源码 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`，来自 [运行 38393501421](https://github.com/czechiuu/plans/actions/runs/38393501421)。匿名发布页 8 项、真实 API 11 项已通过；浏览器整条流程因切账号超时仍未通过。公开注册已关闭；邮件投递不是本轮门槛。生产测试只写合成数据，按本轮唯一标记和精确 ID 清理；不导入真实档案。

原先 14 项长期需求中，第一阶段只交付双人固定账号、私有档案、手动日程、体重、共享/代改、导出/清除/退出。自然语言、20:00 自动生成、计划版本、运动动画、饮食照片/AI、完整日程→计划→动画→记录流程均属后续阶段，当前未实现。资料/权限安全要求仍是第一阶段必须通过的验收，不因阶段缩小而放松。
