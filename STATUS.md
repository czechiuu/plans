# 项目状态

更新时间：2026-10-13（Asia/Shanghai）。源码、本地验证、生产执行和真机验收分别记录；未运行不算通过。

## 当前生产

[实际网站](https://czechiuu.github.io/plans/) 运行固定双账号基础版，源码 `d9447478fa326b43fe8e6d74f61a2fcc1c133c5e`，[实际部署](https://github.com/czechiuu/plans/actions/runs/38393501421)。本轮开始时 main 为 `d9e406592f1d163276c0d6e1b0ffd429c22be73e`。

本轮已只读核对原 Supabase：迁移仅 001/002/003，历史源码摘要一致；尚无新健康表、Edge Functions、自定义 secrets、pg_cron 或 pg_net。没有重建项目、重跑旧迁移或导入个人健康档案。

注册和匿名登录已关闭，两指定账号同一空间。邮件与邀请为**需求取消**，不是通过。原版真实 API 11/0，原版真实浏览器 9/1（切账号超时），原报告保留；新版修复了应用退出流程，尚未真实复测。两台物理设备未验收。

## 本轮源码与证据

已写六页手机界面、退出期间锁定输入、日程草稿确认、个人规则、计划版本与锁定、逐组训练及休息保存、手动餐食与确认汇总、私人照片处理、服务端 AI 接口与上海 20:00 调度。保留原体重、日程、固定账号和权限。自制肌群位置插图不冒充动作示范，实际示范来自逐项核验的视频嵌入。

| 环境 | 通过 | 失败 | 证据与边界 |
|---|---:|---:|---|
| 本地单元 / PGlite / 合成 Auth | 56 | 0 | [报告](test-results/unit-results.json)，附源文件摘要 |
| 历史邀请锁顺序 / 隔离 PostgreSQL | 5 | 0 | [报告](test-results/concurrency-results.json)，不表示生产开放邀请 |
| 健康权限与并发 / 隔离 PostgreSQL | 11 | 0 | [报告](test-results/health-concurrency-results.json)，真实多连接等待 |
| 004 一次部署包 / 隔离 PostgreSQL | 7 | 0 | [报告](test-results/health-migration-wrapper-results.json)，首次/重复/冲突/回滚 |
| 未配置页面 / 独立空配置进程 | 2 | 0 | [报告](test-results/unconfigured-results.json) |
| 模拟界面 / 合成资料 | 15 | 0 | [报告](test-results/ui-mock-results.json)，不算云端 |
| 动作人工核对与嵌入播放 | 11 | 0 | [来源](docs/EXERCISE-SOURCES.md)，不代表两台真机可播放 |
| 新版真实云端 | 0 | 0 | 未完成：004/函数未执行、密码未提供，缺配置记阻塞 |
| OpenAI / 真实20:00 / 两台物理设备 | 0 | 0 | 均未执行 |

合成截图：[手机训练](test-results/mobile-training-synthetic.png)、[桌面训练](test-results/desktop-training-synthetic.png)、[手机饮食](test-results/mobile-food-synthetic.png)。前端构建与 Edge 打包成功，不等于服务验收。

004 SHA-256：`abc6511e871f3aab17d89d5640de235e96ddddb4486178d827430947dc319585`。[一次执行包](supabase/admin/apply-health-004.sql)核对旧迁移和两固定账号，在同一事务执行并登记；同源码重复为空操作，冲突时报错。

## 云端待办与限制

1. 操作时确认后，在原项目执行 004、部署三项函数和私人照片 bucket、配置服务端调度。新增健康数据访问权限需浏览器工具规定的确认；前端发布已有授权。
2. AI 密钥和费用预算尚未配置，默认关闭；两人本人分别同意文字/图片才可调用。ChatGPT 网页会话不能当接口，官方套餐 OAuth 接入资格尚未验证，见 [AI 边界](docs/AI-CONFIG.md)。
3. 调度凭据由管理员在安全界面填写；没有观察到真实到点执行前，不宣称20:00验收通过。
4. 两账号安全输入后跑真实 API、网页和健康子集，只清理本轮唯一标记及精确 ID，再做[双设备验收](docs/DEVICE-ACCEPTANCE.md)。

自动餐食目前沿用本人确认的三餐模板，AI 不自行换菜单、减少份量或增减餐数；不等于每天多样化 AI 菜单。伤情/训练历史未确认时只给明确休息建议。照片单条共享标记上传后不能改，撤销单张需删除；关类别共享立即阻止对方新的下载请求。另一设备需手动刷新，未实现手机推送。

免费 Supabase 的暂停/可用性限制仍适用。AI、完整云端链路、真实定时和真机未验收，不能称为完整版交付。详见[测试清单](docs/TEST-CHECKLIST.md)和[部署说明](docs/HEALTH-DEPLOY.md)。
