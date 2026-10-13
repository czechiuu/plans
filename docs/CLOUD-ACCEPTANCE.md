# 第一阶段云端验收

**当前：项目、迁移和网页部署已完成；三账号业务、真实邮件和双物理设备尚未通过。** 这里只记录实际证据和剩余门槛，不能把匿名拒绝或页面上线当作完整权限验收。

| 已完成项目 | 证据与边界 |
|---|---|
| 免费项目与数据库 | `czechiuu's Project`，组织 `czechiuu's Org`，ref `wnzbtitlvteptkvwhavw`，ap-south-1 Mumbai/NANO。确认初始 `public` 应用表和 Auth 用户均为空；SQL Editor 事务按顺序应用 `202610130001_initial.sql`、`202610130002_space_lock_order.sql`，迁移历史保存与仓库一致的 LF 规范化 SQL；14 项结构/ACL 检查通过。[报告](../test-results/cloud-setup-results.json) |
| 匿名访问 | 公开密钥、无会话请求读取 7 张表及调用 `current_space_id`，8 项均被真实服务拒绝。[报告](../test-results/cloud-anonymous-results.json)；未测试已登录账号之间的 RLS |
| 前端部署 | [https://czechiuu.github.io/plans/](https://czechiuu.github.io/plans/)，[当前 Actions 运行 38378521147](https://github.com/czechiuu/plans/actions/runs/38378521147) 的 test-build/deploy 均成功；部署应用源码 `3ded57c825fa375564d389629dd990858ebf97cf`。[新版受影响回归](../test-results/deployment-regression-results.json) 4 通过、0 失败，[手机截图](../test-results/deployed-mobile-login-verified.png)；首发[旧版检查](../test-results/deployment-results.json) 8 通过、1 失败（图标 404）、3 未运行，仅作历史，没有重跑首发全清单 |

以后若发现差异，先核对迁移历史与实际 schema，只新增按序补丁；**不要重跑历史 001/002**。管理员 SQL Editor 的结构检查不替代普通账号通过应用读写的结果。

## 邮箱与页面回跳

Auth Site URL 已保存为实际网页 [https://czechiuu.github.io/plans/](https://czechiuu.github.io/plans/)；Redirect URLs 已保存并回读确认总数为 2，只有 `https://czechiuu.github.io/plans/` 与 `https://czechiuu.github.io/plans/index.html` 两个精确入口，没有宽泛通配。控制台读到 Allow new signups 与 Confirm email 开启、anonymous signins 关闭、Email 启用，这些开关未改；见 [配置回读报告](../test-results/cloud-auth-config-results.json)。真实注册确认与密码重置仍需核对邮件链接落在项目路径、新密码可登录、旧密码失效，不截图认证参数或密码。见 [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)。

Custom SMTP 当前关闭。Supabase [SMTP 文档](https://supabase.com/docs/guides/auth/auth-smtp)说明默认服务只发给组织 team 的预授权邮箱、当前上限 2 封/小时且不适合生产。用户没有现成 SMTP，已要求选择免费方案；个人 QQ 邮箱 SMTP 已作为候选提出，待用户选择和配置，项目所在区域的实际投递尚未验证。不把测试账号提升为组织成员，也不关闭邮箱确认绕过限制。邮件渠道未确定时，真实注册/重置标“未运行”。

## 测试配置与实际顺序

1. 前端本地 `.env.local` 和 GitHub Actions Variables 只有 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 两项**公共**值。不得放 `secret`、`service_role`、SMTP/AI 凭据或健康数据；`.env.local` 被 Git 忽略。首次部署检查未发现私有资料泄漏，真实账号运行日志仍待验收。
2. 准备三个**不同的专用合成 A/B/C 账号**，完成真实邮箱确认。绝不使用“我/W”的账号或真实健康资料；云脚本运行时三个账号应尚未加入空间。云 API 脚本仅从进程读取 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`TEST_A_EMAIL/PASSWORD`、`TEST_B_EMAIL/PASSWORD`、`TEST_C_EMAIL/PASSWORD` 共 8 项及 `TEST_ACCOUNTS_ARE_DISPOSABLE=YES`。真实页面脚本再需 `E2E_BASE_URL=https://czechiuu.github.io/plans/`。只在本机安全环境或被 Git 忽略的 `.env.cloud-test` 中设置，不贴聊天、截图或日志。
3. `scripts/verify-cloud.mjs` 和 `scripts/verify-cloud-browser.mjs` **不会自动读取 `.env.local`**。若用本机忽略文件，明确运行 `node --env-file=.env.cloud-test scripts/verify-cloud.mjs` 及对应 browser 脚本。已带项目公共配置和网页地址重跑，[API 11 项](../test-results/cloud-api-results.json) 与 [页面 7 项](../test-results/cloud-browser-results.json) 均为 0 通过、0 失败，现只缺 A/B/C 账号凭据和 `TEST_ACCOUNTS_ARE_DISPOSABLE=YES`，不能写成通过。页面脚本使用已发布 HTTPS 网址或已配置 production preview，不能用 Vite dev 或模拟 API。
4. 账号可用后，机器先验证匿名/第三人隔离、默认私有、类别＋单条共享/撤销、代改、冲突、导出、清除与退出。管理员按本轮合成账号/空间做数据库删除计数；然后由用户与 W 仅执行 [两台物理设备 5 步流程](DEVICE-ACCEPTANCE.md)。两个窗口不是两台设备。

客户端 A、B、C 或匿名查询为空，只证明当前身份看不到，**不能单独证明物理删除**。管理员在 SQL Editor 中以本轮合成账号 UUID 替换占位符并核对清理前后计数；未替换时查询应报错，不会产生虚假的零结果：

```sql
with test_users as (
  select unnest(array['<A_UUID>'::uuid, '<B_UUID>'::uuid, '<C_UUID>'::uuid]) as user_id
)
select 'health_profiles' as table_name, count(*) as remaining from public.health_profiles where user_id in (select user_id from test_users)
union all select 'schedules', count(*) from public.schedules where user_id in (select user_id from test_users)
union all select 'weights', count(*) from public.weights where user_id in (select user_id from test_users)
union all select 'members', count(*) from public.members where user_id in (select user_id from test_users);
```

另按本轮合成 `space_id` 和 `created_by` 检查 `invites` 与 `spaces`；不执行无过滤的清理。过期邀请可等待真实 24 小时，或由获授权管理员只定位本次合成邀请的 `id + space_id + created_by` 后单条调整 `expires_at`，不能给客户端管理权。数据库备份保留/删除规则**尚未核实**，表计数为零不代表备份已删除。

| 剩余门槛 | 状态 | 脱敏证据 |
|---|---|---|
| 两条精确 Redirect URL | 已保存并回读 | 两条精确入口，无通配 |
| 部署资源/匿名页面 | 新版受影响回归 4 通过、0 失败；旧版 8 通过、1 失败、3 未运行为历史，首发全清单未重跑 | [新版报告](../test-results/deployment-regression-results.json)、[手机截图](../test-results/deployed-mobile-login-verified.png)、[旧版报告](../test-results/deployment-results.json) |
| 可用邮件渠道、注册确认与重置全流程 | 未运行 | 待填 |
| 三账号真实 API 11 项与页面 7 项 | 阻塞：无专用账号 | 待填 |
| 邀请过期、清理后管理员计数、备份规则 | 未运行／备份未知 | 待填 |
| 两台真实物理设备 | 未运行 | [人工记录](DEVICE-ACCEPTANCE.md) |

所有记录只留设备、时间、结果及脱敏证据；不记邮箱、密码、邀请令牌、Auth 会话或真实健康内容。全部关键门槛通过前不导入真实档案，也不进入第二阶段。
