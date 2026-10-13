# 第一阶段验收清单与证据

截至 2026-10-13（Asia/Shanghai）。通过只记实际执行；模拟、本地、结构、匿名、云端业务和真机分别统计，不能相互替代。固定账号方案新本地测试总数待本轮最终报告补入。

| 环境/项目 | 当前结果 | 证据及边界 |
|---|---|---|
| 本地单元、PGlite/合成 Auth | 37 通过、0 失败 | [unit-results.json](../test-results/unit-results.json)；含固定账号、管理员改密 3 项及 API 竞态 3 项，后两者均包含在 37 中；第三账号隔离只在本地合成夹具验证 |
| 本地 PostgreSQL 多连接 | 历史 001/002 回归 5 通过、0 失败 | [concurrency-results.json](../test-results/concurrency-results.json)，不等于生产 003 |
| 未配置页浏览器 | 2 通过、0 失败 | [unconfigured-results.json](../test-results/unconfigured-results.json) |
| 合成界面 | 6 通过、0 失败 | [ui-mock-results.json](../test-results/ui-mock-results.json)，模拟水印，不算真实云端 |
| 云端 001/002 结构与权限 | 14 通过、0 失败 | [cloud-setup-results.json](../test-results/cloud-setup-results.json) |
| 真实云端匿名拒绝 | 8 通过、0 失败 | [cloud-anonymous-results.json](../test-results/cloud-anonymous-results.json) |
| 真实云端公开注册关闭 | 2 通过、0 失败 | [cloud-auth-public-results.json](../test-results/cloud-auth-public-results.json)，不证明固定账号业务 |
| Auth 配置保存与刷新后回读 | 配置已确认；不计入测试通过数 | [cloud-fixed-auth-config-results.json](../test-results/cloud-fixed-auth-config-results.json)：注册/匿名关闭、Email/确认开启、改密需当前密码开启；与 SQL 12 项分开 |
| 旧版网页受影响回归 | 4 通过、0 失败 | [deployment-regression-results.json](../test-results/deployment-regression-results.json)；旧图标问题已修，不能证明固定账号新版 |
| 旧三账号 API/页面 | 上一方案退出当前门槛 | 现有云端脚本和报告已改为两固定账号；不沿用旧统计 |
| 生产 003/管理员初始化 | 12 通过、0 失败 | [cloud-fixed-setup-results.json](../test-results/cloud-fixed-setup-results.json)：两指定账号同一空间、默认共享/代改全关；只证明结构和初始化 |
| 两固定账号真实云端 API/页面 | 0 通过、0 失败、11／10 阻塞 | [API](../test-results/cloud-api-results.json)、[页面](../test-results/cloud-browser-results.json)；等新版部署和安全输入两位密码 |
| 两台真实物理设备 | 未执行 | [流程](DEVICE-ACCEPTANCE.md) |

当前线上 [GitHub Pages](https://czechiuu.github.io/plans/) 仍是旧版源码 `3ded57c825fa375564d389629dd990858ebf97cf`，运行 [38378521147](https://github.com/czechiuu/plans/actions/runs/38378521147)。新版与真实业务的结果只能在实际完成后填。公开注册已关闭；邮件投递不是本轮门槛。生产测试只写合成数据，按本轮唯一标记和精确 ID 清理；不导入真实档案。

原先 14 项长期需求中，第一阶段只交付双人固定账号、私有档案、手动日程、体重、共享/代改、导出/清除/退出。自然语言、20:00 自动生成、计划版本、运动动画、饮食照片/AI、完整日程→计划→动画→记录流程均属后续阶段，当前未实现。资料/权限安全要求仍是第一阶段必须通过的验收，不因阶段缩小而放松。
