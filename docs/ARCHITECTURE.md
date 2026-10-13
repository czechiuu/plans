# 架构与费用

## 选择

GitHub存源代码与部署流程，GitHub Pages承载Vite原生JavaScript前端。Supabase提供Auth、Postgres与行级权限；照片阶段使用私有Storage，AI阶段使用Edge Functions，自动计划阶段使用数据库Cron。不为两人增加独立服务器、消息队列、微服务或多个数据库。

用户已确认Supabase免费方案，并指定公开代码仓库czechiuu/plans。本轮上传第一阶段源码，云端尚未配置；推送只运行测试构建，网页部署需配置后手动触发。Sites技能已用于选择与预览指导，本项目不创建Sites托管服务，遵从用户GitHub部署方向。

网页资源可公开下载，健康记录和照片不在网页资源或仓库；保密依赖服务端身份/空间权限。公开URL不意味着健康数据公开。所有读写走真实Auth身份，前端公共密钥不提供管理权限。

## 页面

| 页面 | 第一阶段 | 后续 |
|---|---|---|
| 今日/明日 | 日期、本人/伴侣/共同已确认日程，未生成计划提示 | 可执行计划、来源、版本、状态、待更新 |
| 日程 | 原文与结构化手动确认、改删 | 自然语言解析与歧义确认 |
| 体重 | 实际记录、7日平均与数量、补录改删 | 可选训练完成情况 |
| 个人资料/隐私 | 私人导入、目标、共享、代改、邀请、导出清除退出 | AI具体授权、费用与调用状态 |
| 饮食 | 未实施 | 文字/份量/照片草稿确认、估算汇总 |
| 动作与训练 | 未实施 | 合法动画、技术步骤、实际完成组次 |

## 后台计划原则

第三阶段的任务应执行时间20:00上海（12:00 UTC），将目标日期在排队时固定。唯一空间/日期、事务领取、发布锁和唯一版本，不能使用GitHub Actions作为准时保证或网页计时器。两人的版本必须校验后在同一事务发布。锁定/人工修改要显式决定再生成，不静默覆盖。第三阶段才实现与验证，不提前宣称已自动运行。

## 付费与配置

- 用户指定的公开GitHub仓库仅含代码，可使用免费GitHub Pages；真实资料严格排除，不改变可见性、不自动升级。
- Supabase先免费。官方目前列Pro从25美元/月起；免费项目可能因不活动暂停，不适合作未经验证的长期定时可靠性保证。需要长期可靠运行时再讨论付费，不预购买。
- 邮箱注册/确认和重置需可投递邮件；默认邮件服务有限制，正式两人注册可能需配置自己的SMTP或受邀账号。未配置邮件不关闭邮箱确认绕过。
- AI供应商、模型、保存政策、预算上限尚未决定，第四阶段前确认对应授权。当前零AI调用。
- 域名可选，使用github.io地址即可。浏览器推送未接入。
- 密码、SMTP/API/AI密钥只在控制台安全配置；不要贴进聊天。前端只需要项目URL和publishable公共密钥。

官方依据（2026-10-13核对）：[GitHub Pages工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[私有Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals)、[Cron](https://supabase.com/docs/guides/cron)、[价格](https://supabase.com/pricing)、[密码登录与邮件](https://supabase.com/docs/guides/auth/passwords)。具体上线费用以开通时控制台为准。
