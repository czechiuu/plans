# 动作库来源与演示核验

原视频核验日期：2026-10-13。当前线上 `da20689` 已发布三个 [AscendAPI / ExerciseDB](https://ascendapi.com/) 连续 GIF 与八个原发布者视频入口；[实际线上 IAB 媒体核验](../test-results/exercise-gif-iab-results.json) 7/0，三个 GIF 均完整显示并可收起，有计划时展开其他动作后11个ID唯一，八个原视频 href 均一致但未逐个在手机播放。[10:12:16 最终整轮网页](../test-results/cloud-health-ui-20261014-1812-results.json) 6/1 原失败保留；[免登录真实生命周期](../test-results/frontend-gif-lifecycle-results.json) 3/0 核对最终三图均加载，整轮不再重跑。三个 GIF 的使用遵守[官方免费版限制](https://oss.exercisedb.dev/docs)：仅个人、非商业使用，须标注 AscendAPI；它们不是本项目原创，也不是 CC0。八个原视频保留原发布者链接，不下载、剪辑或重新托管。`demo.license` 只记录 **YouTube 播放器嵌入范围**，不是视频内容的开放版权。若原视频下架或禁止嵌入，应标为不可用，不用同名但动作不同的视频补上。

原视频核验方式：先在原发布者页面核对来源与视频 ID；再用 Chrome 打开原片，实际播放、查看器械和动作画面；最后在带正常网页来源地址的页面中点击对应 YouTube iframe 播放按钮，确认 `<video>` 的时间前进、`readyState=4`、无播放错误。直接打开无来源地址的 iframe 曾显示播放器配置错误，因此嵌入验证使用正常网页来源；这不是绕过上传者限制。用户已亲自播放核对三个指定 GIF；[新媒体合成浏览器流程](../test-results/frontend-exercise-media-results.json) 6/0，覆盖懒加载、失败与重试、显示、计划动作折叠、八个原视频入口及训练不中断。当前线上 IAB 390×844 的三图原尺寸与显示均180×180，打开和收起正常，全部收起后图片0，文档宽375≤390；三张实际截图只保存在本机私有结果目录，不放公开文档。第三方媒体不能保证永久可用。

| 动作 ID | 原发布者与视频 | 动作画面核对 | 文字动作依据 |
| --- | --- | --- | --- |
| `machine_leg_press` | [Kenosha YMCA：LifeFitness Seated Leg Press](https://www.youtube.com/watch?v=QwBvFgAVOTo) | 坐姿腿举，脚踏和靠背可见；播放与嵌入均通过 | [ACE 坐姿腿举](https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/) |
| `machine_seated_row` | [AscendAPI / ExerciseDB 连续 GIF：7I6LNUG](https://static.exercisedb.dev/media/7I6LNUG.gif)；保留[原视频](https://www.youtube.com/watch?v=Hu1Pqz-6OIU) | 用户已播放核对；线上 IAB 显示通过 | [ACE 坐姿划船](https://www.acefitness.org/resources/everyone/exercise-library/168/seated-row/) |
| `machine_chest_press` | [AscendAPI / ExerciseDB 连续 GIF：DOoWcnA](https://static.exercisedb.dev/media/DOoWcnA.gif)；保留[原视频](https://www.youtube.com/watch?v=0La1aFp-hKA) | 用户已播放核对；线上 IAB 显示通过 | [ACE 坐姿胸推](https://www.acefitness.org/resources/everyone/exercise-library/188/seated-chest-press/) |
| `machine_seated_leg_curl` | [AscendAPI / ExerciseDB 连续 GIF：Zg3XY7P](https://static.exercisedb.dev/media/Zg3XY7P.gif)；保留[原视频](https://www.youtube.com/watch?v=80AV3aCz65M) | 用户已播放核对；线上 IAB 显示通过 | [NASM 坐姿腿弯举](https://www.nasm.org/resource-center/exercise-library/seated-leg-curl)、[Life Fitness 器械指导](https://support.lifefitness.com/hc/en-us/articles/360036936034-Circuit-Series-Machine-Use-Instructions) |
| `machine_lat_pulldown` | [Kenosha YMCA：Lat Pull Down](https://www.youtube.com/watch?v=tK35eqRNrPM) | 坐姿固定大腿的高位下拉机可见；播放与嵌入均通过 | [ACE 高位下拉](https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/) |
| `machine_hip_abduction` | [Kenosha YMCA：Hip Abduction](https://www.youtube.com/watch?v=RNLTuarDpTA) | 视频原片标题明确外展，画面有坐姿腿部挡板；不是内收；播放与嵌入均通过 | [Kenosha YMCA 器械教学页](https://www.kenoshaymca.org/y-videos/) |
| `machine_ab_crunch` | [Kenosha YMCA：Abdominal Machine](https://www.youtube.com/watch?v=nlqEDo8odJM) | 坐姿腹卷腹机肩部垫和活动臂可见；播放与嵌入均通过 | [ACE 坐姿卷腹](https://www.acefitness.org/resources/everyone/exercise-library/291/seated-crunch/) |
| `dorm_supported_dumbbell_row` | [ATHLEAN-X：1 Arm Rows](https://www.youtube.com/watch?v=q65uDGJ9ZPs) | 双脚着地、一手扶固定器械架、另一手划哑铃；播放与嵌入均通过。**视频用健身架，寝室必须另行确认桌面或床架稳固，不能把可移动家具当等效支撑。** | [PureGym 单臂哑铃划船](https://www.puregym.com/exercises/back/rows/single-arm-dumbbell-row/)明确支持以稳固表面替代训练凳 |
| `dorm_dumbbell_floor_press` | [Runna：Floor Dumbbell Bench Press](https://www.youtube.com/watch?v=vagdk94bFn4) | 人躺在地面训练垫上做哑铃卧推；播放与嵌入均通过 | [Runna 原教程](https://support.runna.com/en/articles/6413209-floor-dumbbell-bench-press-exercise-tutorial) |
| `dorm_sit_to_stand` | [NHS inform：Sit to stand](https://www.youtube.com/watch?v=29WFLqHgYZ0) | 人从椅子坐姿起立；播放与嵌入均通过。视频为康复场景，计划不据此推断个人治疗适应证。 | [NHS 动作视频页](https://www.nhs.uk/live-well/exercise/strength-and-flex-exercise-plan-how-to-videos/) |
| `dorm_dead_bug` | [NASM：How to do a Dead Bug](https://www.youtube.com/watch?v=bxn9FBrt4-A) | 仰卧交替伸展对侧手脚；播放与嵌入均通过 | [NASM 死虫动作说明](https://www.nasm.org/resource-center/exercise-library/dead-bug) |

来源视频展示的是**具体器械型号**，用户所在健身房的器械可能有不同调节和限位。首次使用器械应请现场教练确认。`alternatives` 表示训练目标相近时可考虑的另一动作，不表示两者力学完全等效；高位下拉和单臂划船、卷腹机和死虫尤其不能互称同一动作。动作库提供通用说明，不代替针对个人疾病或疼痛的医疗建议。

自动计划只能选用 `demo.verificationStatus === 'verified'` 的 ID。三个 GIF 是外部连续动作媒体，八个视频是原发布者入口；旧双帧 SVG 不作为完整教学，也不能把外部 GIF 标为原创 CC0。GIF 加载失败要明确显示失败、允许重试，并保留可用的原视频链接；原视频不可用时保留文字说明，不造假链接。首次使用器械仍须现场核对，媒体不代表对个人动作的医学判断。
