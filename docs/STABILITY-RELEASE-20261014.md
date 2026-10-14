# 2026-10-14 稳定版发布记录

[网页版](https://czechiuu.github.io/plans/)已发布。本轮只完成体重入口、三个后端修复、必要验收与原生小程序接口交接，至此停止扩功能。

| 实际版本 | 证据 |
|---|---|
| 前端 `44a176234aac6498dc1f6736ff873834e075a26a` | [CI](https://github.com/czechiuu/plans/actions/runs/38561168295)、[Pages](https://github.com/czechiuu/plans/actions/runs/38561891982)均成功；[匿名8/0](../test-results/deployed-public-results.json)资源摘要与dist一致 |
| AI/cron源码 `1c3444ddc8a8dd6b625b99d3994c2fae736f49fe` | [CI](https://github.com/czechiuu/plans/actions/runs/38556880332)成功，下载源码逐字节SHA匹配 |
| 照片函数 `eea81bb` | 未改动，实际下载源码与原bundle一致 |
| 数据库001–010 | 010生产登记MD5 `794cd74aec7b33fa75500dc9571488ed`；新增表RLS开启、匿名及普通认证角色不能直接读取 |

三函数下载SHA256：AI `efc98c696c663bc9336eb546536cef3b171f26fe4892cc14e09c933c8266cab1`（278994字节）；cron `77641e3f4019edad7e099bc828e1de8fe7006d7bf3fae950d96cd86df56729b1`（333395）；照片 `5c3bbd09fd54ad322d326963d14fb47d424b64b503dbaab2c439326c7adce984`（229702）。完整元数据在[版本报告](../test-results/stability-release-20261014.json)。

首页和趋势顶部都有“记录体重”，沿用原表单、保存接口及数据结构；上海今天、kg、补录、选填项、默认私有保留，保存后反馈并刷新。生成任务使用原子领取结果中的供应商和输入版本；输入快照不变，每轮成功领取另记发布关联，A→B→A不删除历史；正式AI与DeepSeek探针共用服务端原子预算统计和原有全局、供应商、个人限额。

## 验证结论

- 完整单元103/0，五组真实PostgreSQL并发37/0；A→B→A、任务规则模式零AI预约/请求、正式与探针混合并发已接入现有CI门禁。首次单元101/2保留[原日志](../test-results/stability-unit-20261014.tap)，最终见[串行日志](../test-results/stability-unit-serial-final-20261014.tap)。
- 体重[合成手机3/0](../test-results/frontend-weight-shortcut-results.json)、[已发布实际保存链4/0](../test-results/weight-shortcut-iab-results.json)、[最终顶部入口2/0](../test-results/weight-trends-top-iab-results.json)。最终390×844，按钮184–231像素内、文档宽375，无横向溢出。本机实际截图保存在test-results/private/，不入公共仓库；模拟、IAB和实体手机分别表述。顶部修正初次环境准备0通过/1失败/3未运行，随后获批本地回环环境3/0；[尝试说明](../test-results/frontend-weight-trends-top-attempts.json)明确首轮原报告被同运行器覆盖，仅保留代理汇报摘要。
- 最终[匿名页面8/0](../test-results/deployed-public-results.json)、[Edge拒绝边界14/0](../test-results/edge-public-results.json)。它们不代替健康业务验收。
- 既有[三个连续GIF、八个原视频入口证据](../test-results/exercise-gif-iab-results.json)保留；只确认源代码等待complete且naturalWidth>0，未重跑整轮。旧[整轮6/1](../test-results/cloud-health-ui-20261014-1812-results.json)不改写；原视频未逐个手机播放。当前真正免费的UI-only参数为--daily-ui-only；本轮未运行旧授权/限额模式，也未重跑付费链路。

## 实际上海20:00与重复调度

[独立定时报告](../test-results/natural-cron-20261014-results.json)4/0，数据为明确标记的合成规则和日程，未写本人健康资料。管理员通过原RPC暂存测试输入，不是两人重新登录验收；测试网页在到点前关闭，未手动入队或调用cron。pg_cron真实20:00:00触发，HTTP回执入队2、执行2、无失败，随后分别校验源输入快照、计划内容和每轮发布关联：

| 人员 | 发布（上海） | 目标日 | 结果 |
|---|---|---|---|
| 我 | 20:00:03 | 2026-10-15 | rules、版本1、三餐完整、未知训练条件安排休息、一次发布 |
| W | 20:00:04 | 2026-10-15 | rules、版本1、三餐完整、未知训练条件安排休息、一次发布 |

20:05自然调度入队0/执行0，两份计划ID、版本、发布时间及发布次数不变；清理后20:10仍入队0/执行0。正式调用4、探针5、已用9美分均不变。本轮新增付费调用和费用为0。生产没有故意注入失败；失败可见状态、有限重试、旧输入拒绝等由隔离回归验证，不能称生产故障演练。

清理先回滚预演，再按精确ID、所有者、来源、版本和updated_at提交；用户编辑或来源不明即保留。合成体重及对应审计、合成规则/日程/可见计划均剩0；保留两条成功任务、不可变输入快照和发布历史，防当前锚点重新入队。旧两条任务和个人授权/预算的整行摘要未变，账本未变；来源不明旧创建回执1条保留。私有回执与可选下锚点精确清理模板只留本机，不公开账号UUID。

## 仍需真实设备或本人资料

DeepSeek当前月度已用9/10美分（旧探针5、此前正式4），剩余1低于新请求至少2美分预约，暂不能再发起新的付费AI调用；手动和规则功能可用。没有加预算或改变W授权；费用、凭据和安全配置若需新增变更须另获确认。

两台物理手机尚未验收，已交[简短清单](DEVICE-ACCEPTANCE.md)。原生微信小程序只交[接口文档](../MINIAPP_HANDOFF.md)，复用现有后端、固定账号和数据；AppID、主体及域名资格、真机网络和原生媒体适配未确认。本轮不注册、不购买、不支付、不承诺每日微信通知、不整体迁库。
