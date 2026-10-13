# AI 接入与配置边界

核对日：2026-10-13。尚未配置密钥或启用付费调用；下列是拟用方案，不是上线或质量验收结果。

## 服务商、模型与数据

拟使用 OpenAI Responses API。官方当前列出 `gpt-5.4-mini` 支持文字、图片输入及结构化输出，标准价格为每百万输入 token 0.75 美元、输出 token 4.50 美元。模型通过服务端配置选择，变更时须同步核对价格和能力；不将健康信息自动转发给其他服务商。[模型说明](https://developers.openai.com/api/docs/models/gpt-5.4-mini)

日程解析只发送当次原文及解释日期必需的上海时间；计划发送本人确认的限制、目标日程及有限的近期执行摘要；照片估算仅发送选择的净化后餐食图片与份量补充。没有姓名、邮箱、伴侣私有资料或无关完整历史。用户原文和图片文字作为数据处理，不能调用工具或改变权限。

本人分别控制文字和图片授权，默认关闭。手动记录不需要同意 AI。所有回复先进行结构及规则检查，日程和摄入仍须用户确认；拒绝、超时、无效输出均显示实际失败，规则方案明确标注来源。

请求设置 `store:false`。这不等于零保存：OpenAI API 默认不用于训练，滥用监测日志通常可保留至多 30 天，政策列有例外；零数据保留需要额外资格，本站未取得。[官方数据政策](https://developers.openai.com/api/docs/guides/your-data)

## 安全配置与预算

管理员在 [现有 Supabase 项目的 Edge Function Secrets](https://supabase.com/dashboard/project/wnzbtitlvteptkvwhavw/functions/secrets) 中自行填写 API 密钥。不得发聊天、提交代码、放入 `VITE_` 或浏览器储存。账号充值/付款由用户操作，当前没有支付授权。

代码已设置全空间上海自然月预算和个人上限；每人每类最多20次/日、3次/分钟，30秒超时，输入、输出与重试有界。数据库原子预留最坏费用，未知消耗不释放，清除健康数据不重置账本。输入token保守预留上限30000，图片费率按当前模型配置。新月份需管理员另设预算，未设时关闭。本地检查通过，真实计费未验收；不只依赖供应商预算通知，也不承诺固定费用。

## ChatGPT 网页账号能否代替 API

不读取密码、Cookie 或浏览器会话来自动操作聊天网页。官方确有通过 OAuth 使用 ChatGPT 套餐的能力，文档面向符合条件的开源、本地及自托管应用；远程托管应用有额外接入条件。本项目当前的 GitHub Pages + Supabase 部署未验证资格，也未接入该方案。[套餐使用说明](https://developers.openai.com/siwc/token-sharing-open-source)、[自托管说明](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)

普通 Platform API 使用单独的服务端凭据与用量计费。ChatGPT 订阅或 Codex 已登录不代表网站具有 API 凭据。[API 认证](https://developers.openai.com/api/reference/overview)
