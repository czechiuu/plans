# 动作库来源与演示核验

核验日期：2026-10-13。`shared/exercises.js` 只引用原发布者的 YouTube 官方播放器，不下载、剪辑或重新托管视频，也不把来源网站的照片复制进项目。`demo.license` 记录的是**允许使用播放器嵌入功能的范围**，不是视频内容的开放版权。YouTube 的[官方嵌入说明](https://support.google.com/youtube/answer/171780?hl=en)允许在网页中放置播放器；若上传者以后关闭嵌入或视频下架，必须将该动作改为 `unavailable`，不能用同名但动作不同的视频补上。

核验方式：先在原发布者页面核对来源与视频 ID；再用 Chrome 打开每条 YouTube 原片，实际播放、查看器械和动作画面；最后在带正常网页来源地址的页面中点击对应 YouTube iframe 播放按钮，确认 `<video>` 的时间前进、`readyState=4`、无播放错误。直接打开无来源地址的 iframe 曾显示播放器配置错误，因此嵌入验证使用正常网页来源；这不是绕过上传者限制。每个链接只在本次日期核验，不能保证第三方视频永久可用。

| 动作 ID | 原发布者与视频 | 动作画面核对 | 文字动作依据 |
| --- | --- | --- | --- |
| `machine_leg_press` | [Kenosha YMCA：LifeFitness Seated Leg Press](https://www.youtube.com/watch?v=QwBvFgAVOTo) | 坐姿腿举，脚踏和靠背可见；播放与嵌入均通过 | [ACE 坐姿腿举](https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/) |
| `machine_seated_row` | [Kenosha YMCA：Row Machine](https://www.youtube.com/watch?v=Hu1Pqz-6OIU) | 坐姿划船器械与拉柄可见；播放与嵌入均通过 | [ACE 坐姿划船](https://www.acefitness.org/resources/everyone/exercise-library/168/seated-row/) |
| `machine_chest_press` | [Kenosha YMCA：Seated Chest Press](https://www.youtube.com/watch?v=0La1aFp-hKA) | 坐姿胸推器械和座椅可见；播放与嵌入均通过 | [ACE 坐姿胸推](https://www.acefitness.org/resources/everyone/exercise-library/188/seated-chest-press/) |
| `machine_seated_leg_curl` | [GymCompany：Life Fitness Circuit Series Seated Leg Curl](https://www.youtube.com/watch?v=80AV3aCz65M)，由[健身中心教程页](https://www.lwsb.com/fitness-center-tutorials/)原样嵌入 | 坐姿、膝关节转轴与压腿垫可见；不是卧式腿弯举；播放与嵌入均通过 | [NASM 坐姿腿弯举](https://www.nasm.org/resource-center/exercise-library/seated-leg-curl)、[Life Fitness 器械指导](https://support.lifefitness.com/hc/en-us/articles/360036936034-Circuit-Series-Machine-Use-Instructions) |
| `machine_lat_pulldown` | [Kenosha YMCA：Lat Pull Down](https://www.youtube.com/watch?v=tK35eqRNrPM) | 坐姿固定大腿的高位下拉机可见；播放与嵌入均通过 | [ACE 高位下拉](https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/) |
| `machine_hip_abduction` | [Kenosha YMCA：Hip Abduction](https://www.youtube.com/watch?v=RNLTuarDpTA) | 视频原片标题明确外展，画面有坐姿腿部挡板；不是内收；播放与嵌入均通过 | [Kenosha YMCA 器械教学页](https://www.kenoshaymca.org/y-videos/) |
| `machine_ab_crunch` | [Kenosha YMCA：Abdominal Machine](https://www.youtube.com/watch?v=nlqEDo8odJM) | 坐姿腹卷腹机肩部垫和活动臂可见；播放与嵌入均通过 | [ACE 坐姿卷腹](https://www.acefitness.org/resources/everyone/exercise-library/291/seated-crunch/) |
| `dorm_supported_dumbbell_row` | [ATHLEAN-X：1 Arm Rows](https://www.youtube.com/watch?v=q65uDGJ9ZPs) | 双脚着地、一手扶固定器械架、另一手划哑铃；播放与嵌入均通过。**视频用健身架，寝室必须另行确认桌面或床架稳固，不能把可移动家具当等效支撑。** | [PureGym 单臂哑铃划船](https://www.puregym.com/exercises/back/rows/single-arm-dumbbell-row/)明确支持以稳固表面替代训练凳 |
| `dorm_dumbbell_floor_press` | [Runna：Floor Dumbbell Bench Press](https://www.youtube.com/watch?v=vagdk94bFn4) | 人躺在地面训练垫上做哑铃卧推；播放与嵌入均通过 | [Runna 原教程](https://support.runna.com/en/articles/6413209-floor-dumbbell-bench-press-exercise-tutorial) |
| `dorm_sit_to_stand` | [NHS inform：Sit to stand](https://www.youtube.com/watch?v=29WFLqHgYZ0) | 人从椅子坐姿起立；播放与嵌入均通过。视频为康复场景，计划不据此推断个人治疗适应证。 | [NHS 动作视频页](https://www.nhs.uk/live-well/exercise/strength-and-flex-exercise-plan-how-to-videos/) |
| `dorm_dead_bug` | [NASM：How to do a Dead Bug](https://www.youtube.com/watch?v=bxn9FBrt4-A) | 仰卧交替伸展对侧手脚；播放与嵌入均通过 | [NASM 死虫动作说明](https://www.nasm.org/resource-center/exercise-library/dead-bug) |

来源视频展示的是**具体器械型号**，用户所在健身房的器械可能有不同调节和限位。首次使用器械应请现场教练确认。`alternatives` 表示训练目标相近时可考虑的另一动作，不表示两者力学完全等效；高位下拉和单臂划船、卷腹机和死虫尤其不能互称同一动作。动作库提供通用说明，不代替针对个人疾病或疼痛的医疗建议。

自动计划只能选用 `demo.verificationStatus === 'verified'` 的 ID。若视频失效、嵌入受限或内容被替换，更新核验状态并停止自动选用该 ID；保留文字步骤供人查看，不用通用循环动画伪装成该动作。
