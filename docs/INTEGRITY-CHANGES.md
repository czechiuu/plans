# 后台完整性修改（2026-10-14）

使用 ponytail：沿用现有 RPC、数据库锁、Storage 和验证器，不增加依赖。

006 预先登记 uploading 照片，再上传文件，最后完成登记。照片生命周期、清空资料、退出空间及定时入队使用 space → member 顺序；Storage.objects 写入触发器持相同锁，删除后迟到的上传不能重新登记对象。中断上传和删除失败保留本人可见的清理记录；伙伴和下载始终排除 uploading/deleting。删除可重试。对象路径使用独立照片 ID，旧请求不会删除后来上传的同内容照片。

目标日自身自动计划不再反向进入输入 hash；手动保存及锁定/解锁通过持久 revision 留下变更证据。真实规则、档案、日程、体重、餐食、训练及其他相关日期计划仍参与 hash。相同输入请求保持已完成任务，不能再次领取。

request_plan_generation(date, provider) 原子固定 rules/openai/deepseek；定时任务固定入队时的个人偏好，重试保留原值。旧排队任务未记录服务商时终止为 PROVIDER_UNBOUND，不猜服务商。001–005 原文不改。

隔离 PostgreSQL 验证：健康并发此前 **15 通过、0 失败、0 未运行**（当时006/007版本的证据保留在 test-results/integrity-health-concurrency-results.json）；最终006–008供应商及执行包 **7 通过、0 失败、0 未运行**，报告为 test-results/integrity-ai-provider-concurrency-results.json。Storage 使用最小真实 PostgreSQL 元数据表；这里没有云端 Storage 或付费 AI 验收。

验证器顺序应用全部迁移；准备中止、失败或未运行返回非零。Windows 不加载会覆盖退出码的 embedded-postgres 模块；Linux 完成清理后显式保留门禁退出码。CI 已加入供应商、执行包和活动并发门禁。原沙箱 WAL 文件重命名失败实际返回1；成功结果来自获得工具许可后的独立临时数据库。

执行包：supabase/admin/apply-daily-flow-006-008.sql；生成器：scripts/prepare-daily-flow-migrations.mjs。事务内验证001–005历史原文及名称、执行006/007/008并登记；相同内容重复执行不改数据。旧006–007执行包已移除。冻结的 MD5：006 `387cc96e9854379726dec49837109f69`；007 `a5d069d7931d57a8c9c103d68de54b85`；008 `51fba87f159fb01a44d55920fc7d0891`。执行包 SHA256：`678cd7a0d5436cb93f6042556e145927daa789b081ddc114c10dc95b612dabd6`。后续修改迁移须重新生成并验证。

Storage 上传失败后的底层未登记文件回收由 Supabase Storage 服务处理；已核对[官方上传实现](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts)的失败删除事件。生产 Storage 服务版本和实际文件回收仍属于云端验收；本轮没有连接生产、改预算或读取密钥。

部署审阅工具：`node scripts/serve-deployment-review.mjs [端口]`，默认 `http://127.0.0.1:4319/`。只读取上述执行包和三个 Edge bundle，四项均展示完整只读原文、SHA256和字节数；不存在按请求路径读取文件的入口，页面无脚本或外部资源。最终白名单验证 **1 通过、0 失败**，含四项精确内容/hash、loopback监听、目录遍历及POST拒绝。未启动常驻服务。

确定性营养计算：shared/meal-nutrition.js 的 calculateMealNutrition 按本人确认的各项 grams_min/max × kcal_per_100g ÷100 汇总整餐，再乘一次 eaten_fraction 得到摄入区间；不猜食物密度、不联网、不调用AI。每项 nutrition_source 必填；未知食物或未计油酱使整餐结果为null，并列明缺口。energy_*为未乘比例的整餐值，consumed_*为已乘一次、仅供显示的值。独立算术、缺项、油酱及数值边界验证 **5 通过、0 失败**，接口已交前端接入。

008 复用训练表和保存/删除接口，新增本人私有的已完成/已停止活动，支持 badminton/strength/other、完成日期、实际时长、强度、疼痛和备注。实际起止时间可同时留空；没有时刻时仅以次日上海零点作为恢复计算上界，不写入虚构时间。羽毛球等实际运动影响48小时恢复，只有力量活动计入每周力量次数；旧训练数据不改。只读 health_activity_schema_version 返回8。

餐食和训练新建可传固定 client_request_id；同一本人同一请求原子重放，内容变化拒绝，删除后迟到重试也不能复活。请求凭据只保留内容SHA256，不保留已删除资料正文；清空本人资料或退出会清理凭据。最终活动边界 PGlite **1 通过、0 失败**；真实 PostgreSQL 双连接及恢复检查 **3 通过、0 失败、0 未运行**，报告为 test-results/integrity-activities-results.json。全部为合成数据。
