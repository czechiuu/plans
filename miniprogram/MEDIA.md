# 小程序动作媒体

动作名称、处方、文字步骤和替代动作来自现有 `shared/exercises.js`，小程序不另建动作库。三项器械动作由本人点开时才加载连续 GIF，收起后移除图片；失败会显示重试和文字说明。图片标注 AscendAPI / ExerciseDB，限定个人／非商业使用，不复制或重新托管。

| 动作 ID | 小程序媒体 | 来源 |
| --- | --- | --- |
| `machine_seated_row` | `https://static.exercisedb.dev/media/7I6LNUG.gif` | AscendAPI / ExerciseDB |
| `machine_chest_press` | `https://static.exercisedb.dev/media/DOoWcnA.gif` | AscendAPI / ExerciseDB |
| `machine_seated_leg_curl` | `https://static.exercisedb.dev/media/Zg3XY7P.gif` | AscendAPI / ExerciseDB |

其余八项均为 `source_video`，原 YouTube 页面不是小程序 `<video>` 可用的媒体直链；当前不尝试内播：

| 动作 ID | 本轮小程序状态 |
| --- | --- |
| `machine_leg_press` | 视频暂不可用；保留坐姿腿举文字，不用 45° 腿举替代 |
| `machine_lat_pulldown` | 视频暂不可用；保留文字和原来源 |
| `machine_hip_abduction` | 视频暂不可用；保留文字和原来源 |
| `machine_ab_crunch` | 视频暂不可用；保留文字和原来源 |
| `dorm_supported_dumbbell_row` | 视频暂不可用；保留文字和原来源 |
| `dorm_dumbbell_floor_press` | 视频暂不可用；保留文字和原来源 |
| `dorm_sit_to_stand` | 视频暂不可用；保留文字和原来源 |
| `dorm_dead_bug` | 视频暂不可用；保留文字和原来源 |

原 YouTube 地址、发布者和许可字段仍由共享目录保存；页面显示原许可和复制原地址入口，不把复制按钮称为播放，也不下载视频。三项 GIF 对应动作的原视频地址同样保留，GIF 失败时可复制原地址。GIF 署名网站 `https://ascendapi.com/` 在页面显示且可复制；不是本项目原创，也不标 CC0。

2026-10-15 已核对 AppID `wxa45b1a88790a49ec`，三类 Supabase 域名已登记并读回。三个 GIF 均已在真实开发工具中验证加载、180×180 完整显示及收起；正式校验开启的手机媒体仍未验收，管理员手机仅本人反馈打开及登录。八个原视频仍明确不可内播，前三项原生界面已验证，后五项本轮未运行；复制入口的真机行为待按清单确认。详见 `test-results/native-free-flow-20261015.json`。
