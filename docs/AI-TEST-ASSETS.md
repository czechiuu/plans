# AI 视觉测试素材

`tests/fixtures/food-example.png` 是**公开授权的真实食物照片**，仅供合成测试；不是用户餐食，也不代表实际摄入。

- 原图：[Wikimedia Commons：Apples and bananas in bowl.jpg](https://commons.wikimedia.org/wiki/File:Apples_and_bananas_in_bowl.jpg)，作者 Dj Galaxy，作者本人拍摄并主动释入公共领域（PD-self；页面同时声明任何人可无条件用于任何目的）。[原始文件](https://upload.wikimedia.org/wikipedia/commons/3/38/Apples_and_bananas_in_bowl.jpg)。授权及画面于 2026-10-13 核对。
- 可见内容：木碗中的苹果和香蕉，无人物。果实互相遮挡，**只适合断言识别出“苹果、香蕉”两类**；不应断言精确个数、品种、重量、份量或热量。图上也没有可用的真实称重信息。
- 处理：从原图 3072×2304 像素取顶部 3072×1950 区域，去掉相机日期字样；缩至 640×406，并由浏览器画布重新编码成 PNG。再合并 PNG 的 IDAT 块；最终只有 `IHDR/IDAT/IEND` 三块，不保留原图 EXIF、拍摄设备、时间或其他文本元数据。未添加或更换任何食物。
- 最终文件：532,424 字节；SHA-256 `98f8e6cb5209120eb095c31081fe6fad7b526ce5bd468344600917bea27d0943`。已通过项目 `validateSanitizedPng` 校验。

如用它测试视觉模型，只能核对模型是否识别主要食物及是否明确表达份量、营养估算的不确定性。没有称重或配料信息，不能设置精确热量真值；模型输出也不能自动记为用户饮食记录。
