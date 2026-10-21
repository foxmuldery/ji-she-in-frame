# 交接报告 — 《祭：她在画面里》v2.8

> 供审阅 / 接手用的完整状态说明。  
> 日期：2026-10-21（Asia/Shanghai）  
> 路径：`ji_third_person_demo/`
>
> **2026-10-20 审计后更新**：v2.4 被审计发现真实按键阻断；v2.8 已修复 P0 B1–B8 与复核 N1–N3。真实按键可完整通关 help 结局，但最优路径 **85.5 秒**，10 分钟目标仍未达标。详见 [`audit/FIX_REPORT.md`](audit/FIX_REPORT.md)。

---

## 0. 一页结论

**这是什么**
一款离线 HTML5 的 found-footage 心理恐怖 vertical slice。真等距像素房间 + 第一人称旧带 DV，玩家以为自己是谢雨洁，举起摄像机后发现拍摄者是徐英子。

**当前版本**
v2.8「五遍循环」：供桌 → 找她 → 拍异常 → 躲她 → 拍她 / 电话 / 手 / 23:06 回看 / 结局。

**当前完成度**
- 可从头玩到两个主结局 + 一个坏结局
- 46/46 自动化自测通过
- 24/24 音频加载通过
- v2.8 发布包和校验和已完成
- 商店文案、25 张截图、封面已更新

**必须先说明的限制**
- 目标时长写的是 10–15 分钟；v2.8 真实按键最优实测 **85.5 秒**，**10 分钟目标仍失败**，内容需扩充。
- 第二遍是“找她”，第三遍已改为“拍异常”（香1/水右/线低）；但异常可能太隐晦，仍需真人确认是否看得懂。
- 没有存档、没有移动端触控、没有跨浏览器人工验证。
- 自动化测试主要调用函数，**没有做多平台/多路径真实键盘矩阵**；已完成一次真实键盘全流程（85.5s）。
- 素材为占位：DV 实拍片段、老妇面部、关键美术、音效、音乐、语音均为 MiniMax Design 生成或程序化占位，商业发行前必须替换/确认授权。
- 这个目录不是 git 仓库，没有 commit/diff 可审。

**建议审阅顺序**
1. 双击 `dist/ji-she-in-frame-v2.8/index.html`，完整玩一遍并计时。
2. 重点看第三遍“拍异常”是否看得懂、是否真的撑到 10 分钟。
3. 再决定是继续加章节，还是给找她/拍异常加追逃/失败机制。

---

## 1. 交付物与文件

### 运行时发布包

| 路径 | 说明 |
| --- | --- |
| `dist/ji-she-in-frame-v2.8/` | 解压即玩的运行时目录，38 个文件，约 14 MB |
| `dist/ji-she-in-frame-v2.8.zip` | 发布 zip，约 13 MB |
| `dist/ji-she-in-frame-v2.8.zip.sha256` | 校验和 |

**SHA-256**
```
fdf9020febe6c6cee468665fdf06ce515aedf8190c4d34b900b86689f08c47ea
```

源码与发布包里的 `game.js` 当前是同一份：
```
71aaaac30fce820ae881b716b49f5fcf89685352f5514aefd8e7235e554816a4
```

### 源码与文档

| 文件 | 用途 |
| --- | --- |
| `index.html` | 舞台、HUD、标题/暂停/制作名单/结局、章节 HUD |
| `style.css` | CRT/扫描线、HUD、标题、案板、章节 HUD、无闪模式 |
| `game.js` | 主逻辑：状态、等距渲染、DV/回看、五遍章节、音频、测试 |
| `README.md` | 商店向长描述、玩法、操作、素材声明、版本 |
| `RELEASE_CHECKLIST.md` | 上架前人工检查、商业发行替换项、复现命令 |
| `DEVLOG.md` | 逐轮开发记录和调试参数 |
| `HANDOVER.md` | 本文件 |
| `assets/` | 运行时图片、音频、视频、poster 数据 |
| `store/` | itch 封面、25 张截图、itch 文案/元数据 |
| `shots/` | 开发截图 |
| `vendor/` | RetroZone CRT shader + MIT 许可 |

### 代码规模

- `game.js`：约 6,234 行 / 264 KB
- `style.css`：约 495 行 / 22 KB
- `index.html`：约 204 行 / 10 KB

**不是 git 仓库**：`git status` 返回 `fatal: not a git repository`。  
因此没有 commit、分支、diff。版本历史只能看 `DEVLOG.md` 和 `dist/` 里的当前版本。

---

## 2. 当前可玩内容

### 2.1 操作

| 操作 | 键 |
| --- | --- |
| 移动 | `W A S D` / 方向键 |
| 互动 / 调整 / 找到她 | `E` |
| 起仪（提交摆法） | `空格` |
| 供桌记录 | `Tab` |
| 举起 DV / 显影 / 找她 | 按住 `F` / 鼠标右键 |
| 快门 / 拍照 | `L` |
| 回看旧带 | `R` |
| 让她抬手 | `Q` |
| 倒带 / 逐帧 | `A / D` |
| 分屏对照 | `P` |
| 暂停 | `Esc` |
| 静音 | `M` |

### 2.2 五遍流程

#### 第一遍 · 供桌
- 靠近老妇按 `E`，按住 `F` 第一次举起 DV；画面里是谢雨洁，拍摄者是徐英子。
- 放下后她回头，房间进入仪轨。
- `R` 看旧带 18:06：带子说“甲：香二、水中、线低”，但这可能是假的。
- 走到香炉 / 水碗 / 门框旁分别按住 `F` 显影 1.2 秒：
  - 香炉：香三（画面里三根 ghost 香 + 后面的脸）
  - 水碗：水左（碗里两颗眼睛的倒影）
  - 门框：线高（门后影子）
- 显影时按 `L` 可拍一张照片，耗 16% 电；照片边缘会多一只手。
- `E` 调整，摆成乙（3 / 左 / 高），站到供桌前按 `空格` 起仪。
- 摆错进入下一遍：灯灭、眼睛增加、带子变成「这一页不对」；第三次错触发坏结局「她替你摆好了。」
- 摆对：黑场 + 站立人影 + “她刚才，站在你后面”，然后进入第二遍。

#### 第二遍 · 找她
- 黑场重置：椅子空了，老妇不在房间里。
- 按 `F` 用取景器找她；她随机在：
  - 帘子后面
  - 供桌下面
  - 椅子后面
- 取景器显示一只手和文字「取景器：她在帘子后面」等。
- 松开 `F`，走到对应位置按 `E`。找错位置会说“这里只有灰”，她会换地方。
- 找到 3 次，进入第三遍。

#### 第三遍 · 拍异常
- 房间变暗，老妇仍不在椅子上。
- 房间被改过：香 1、水右、线低。
- 走到香炉 / 水碗 / 门框旁按 `F`，取景器显示“本来该是香三/水左/线高”；按 `L` 拍下不对的地方。
- 每次拍照耗 16% 电；拍 3 处，进入第四遍。
- 当前没有“被抓住/失败”惩罚，只有眼睛和呼吸升级。

#### 第四遍 · 躲她
- 老妇站在房间中央；HUD 显示“第 N/3 轮 · 12.0s”。
- 按 `F` 取景器显示她正看着哪个藏点（帘子/供桌下/椅子后），红色虚线连到藏点。
- 放下 `F`，在倒计时内躲到另外两个藏点之一按 `E`。
- 躲错位置或超时：黑场 + 呼吸，回到本轮开头，重新随机视线；不扣已躲轮数。
- 躲开 3 轮，进入第五遍。

#### 第五遍 · 拍她 / 手
- 老妇还站着。走近按 `F`，按 `L` 拍下；电话响。
- 走到门口按 `E`，进入门后走廊；`W` 前进到尽头按 `E` 接电话；电话里说“别让她抬手”。
- 回到房间后她才坐回椅子、暗场解除；没拍之前按 `Q` 提示“先拍她一张”，没接电话提示“先接电话”。
- 按 `Q` 让她抬手；再按住 `F`，取景器里是另一只手。
- 放下 DV，按 `R` 回看 23:06 空白；先按 `1/2/3` 校验“磁带年份 / 缺失帧”，答对才解锁重建条。
- `A/D` 倒带，拖重建条对齐；`P` 分屏。
- 走向她按 `E` → 主结局「你走过去了。」
- 再次按住 `F` 拍第二条 → 主结局「你一直在拍她。」
- 三次摆错 → 坏结局「她替你摆好了。」

### 2.3 收集与结局变化

- 三张快门照片（香炉 / 水碗 / 门框）可在 `Tab` 供桌记录里看到：`照片：香✓ 水○ 线○ N/3`。
- `L` 照片里会多一只像素手。
- 拍齐三张后，放下 DV 会触发 `photoScarePending`：黑场 + 站立人影 + “照片里，站在你身后的，不是老妇。”
- 拍齐三张后，主结局末尾追加：“三张照片里，站在你身后的人，是徐英子。”

### 2.4 当前时长估算

| 段落 | 估算 |
| --- | --- |
| 第一遍供桌（含看带/显影/照片/起仪） | 3–5 分钟 |
| 第二遍找她（3 次） | 2–3 分钟 |
| 第三遍拍异常（3 处） | 2–3 分钟 |
| 第四遍躲她（3 轮，含失败重来） | 2–4 分钟 |
| 第五遍拍她/手 + 回看 + 结局 | 2–3 分钟 |
| 合计 | **10–15 分钟（估算）** |

**这是设计估算，不是实测。** 如果玩家很快理解“取景器直接报位置/差异”，第二遍和第三遍可能各自压缩到 1–2 分钟，总时长可能只有 8–10 分钟。

---

## 3. 技术架构

### 3.1 运行方式

- 纯静态：`index.html` + `style.css` + `game.js` + `assets/`。
- 目标运行方式：直接双击 `index.html`，`file://` 下可玩。
- 不使用 ES modules、`fetch`、构建工具；避免 `file://` 的 CORS 限制。
- 音频使用 `HTMLAudioElement`，不使用 `decodeAudioData`（避免 CORS）。

### 3.2 画面层

- 像素场景画布：`480×270`（`PW/PH`），等距房间、角色、道具、光影。
- DV / 回看画布：`1280×960` 显示尺寸，内部 `640×480`（`CW/CH`），`cctx.setTransform(2,0,0,2,0,0)`。
- 舞台层：标题、HUD、字幕、prompt、timeline、案板、暂停/制作名单/结局。
- CRT：DOM 扫描线 + `vendor/retrozone-shader.js`（MIT）WebGL 覆盖。

### 3.3 等距房间

- 12×9 网格，2:1 地砖。
- `iso(wx,wy) = { x: 240 + (wx-wy)*16, y: 52 + (wx+wy)*8 }`。
- 自由移动、碰撞、深度排序。
- 关键坐标：
  - 香炉：`(8.12, 5.05)`
  - 水碗：`(6.55, 5.15)`
  - 门框/红绳：`(3.7, 1.0)`
  - 供桌中心/起仪点：约 `(7.05, 5.25)`
  - 老妇椅子：`(8.5, 2.5)`
  - 藏身点：帘子 `(2.2, 4.6)`、供桌下 `(7.0, 6.65)`、椅子后 `(9.55, 2.6)`

### 3.4 章节状态

关键 `state` 字段：

| 字段 | 含义 |
| --- | --- |
| `chapter` | 1–5；1 供桌、2 找她、3 拍异常、4 躲她、5 手 |
| `ritual` | 香/水/线、active/done/loop、camSeen、inspected、reviews |
| `hunt` | `{mode:'find'|'anomaly', pos, count, seen}` |
| `hide` | `{round,facing,remaining,active}`；第四遍躲她 |
| `oldWomanGone` | 第二/三遍隐藏坐姿老妇 |
| `darkChapter` | 第三遍压暗房间 |
| `battery` | DV 电量 0–100 |
| `photos` | 香炉/水碗/门框三张照片 |
| `caseOpen` | Tab 案板是否打开 |
| `scanTarget` / `scanDone` / `scanT` | 第一遍显影 |
| `review` / `reviewKind` / `reconOffset` | 回看与重建 |
| `reviewQuiz` | 23:06 校验：`step/locked/wrong` |
| `runStart` / `runEnd` / `chapterTimes` | 本次用时、章节计时 |
| `finalPhoto` | 第五遍是否已拍她 |
| `scene` / `corr` | `room/corridor`；走廊深度、电话、铃声 |
| `phoneDone` | 是否已接电话 |
| `choice` / `mismatch` / `handRaised` | 第五遍拍后抬手/错手/结局分支 |
| `transition` | 章节切换黑场期间锁输入 |

关键函数：

- `startChapter(n)`：黑场 700ms，硬关摄像机、退案板/回看，重置位置/电量/choice，切换老妇显隐/明暗，更新章节 HUD。
- `renderHuntScan(ctx,t)`：第二遍取景器，按 `hunt.pos` 在左/中/右画手和眼，右侧压黑，显示“她在帘子后面”等文字。
- `huntInteract()`：第二遍 `E` 找她；正确 +1，错误换位置。
- `takeAnomalyPhoto()`：第三遍 `L` 拍异常；要求举起 F、有扫描目标、耗电 16%、计数，第三处后进第四遍。
- `anomalyScanMode()` + `renderCameraScan()`：第三遍按香炉/水碗/门框裁切，显示第一遍的正确 ghost，和房间里的错误状态对照。
- `renderCameraScan(ctx,t)`：第一遍按目标裁切香炉/水碗/门框特写，显影 1.2 秒，2.8 秒后风险。
- `updateBattery(dt)`：摄像机开着每秒 -5.5%，关着每秒 +1.4%；电尽强制关镜头。
- `takePhoto()`：第一遍快门/照片；第三遍分派到 `takeAnomalyPhoto()`。
- `startRitualScare()`：第一遍完成黑场 + 站立人影，然后 3 秒后 `startChapter(2)`。
- `hideInteract()` / `updateHide()` / `hideFail()`：第四遍躲她；F 看她视线，E 躲，超时/躲错重来本轮。
- `takeFinalPhoto()`：第五遍 L 拍她；需举机、靠近、电量，拍后 `finalPhoto=true`，电话响。
- `startCorridor()` / `drawCorridor()` / `answerPhone()`：门后走廊与电话；接完 `phoneDone=true`。
- `reviewPick(n)`：23:06 两道校验；`setReconOffset` 在未 locked 时拒绝。
- `updateRunText()`：暂停/结局显示本次用时；`startChapter` 记录章节时长。
- `raiseHand()`：`chapter<5` 或第五遍未拍时拦截。

### 3.5 音频

- 运行时 24 个音频：环境床、雨、灯丝、钟摆、水滴、门轴、脚步、呼吸、四句老妇普通话、音乐、cue。
- 一次性音效为 MP3；`window_rain.wav`、`bulb_hum.wav` 保留 WAV 以保证无缝循环。
- 首次点击「开始」时 `ensureAudio()`，绕过自动播放限制。
- 音频清单与失败行可在 `?nointro=1&novideo=1&audiodbg=1` 查看，标题会变 `AUDIO PASS/FAIL`。

### 3.6 资产

- DV live clip：`assets/video/footage_clip_5s.mp4`（5 秒，占位）
- DV poster：`assets/images/ji_clip_v1_poster.jpg` + `assets/poster_data.js`
- Key art：`assets/images/ji_keyart_v1.jpg`（运行时）/ `.png`（母版）
- 老妇面部：`assets/references/v2/ji_oldwoman_face_v2_480.png`
- 音频：`assets/audio/`（24 个运行时文件 + `source/` 原始文件）
- 字体：仅系统字体，无嵌入字体授权问题

### 3.7 存档 / 设置

- **没有存档**。刷新/重开回到标题。
- 静音、闪烁安全模式等设置只在当前页面内存中，不持久化。
- 完整流程 10–15 分钟，暂时没有做中途保存。

---

## 4. 验证证据

### 4.1 自动化

- 源码 `?nointro=1&test=1`：**46/46 通过**
- 发布包 `dist/ji-she-in-frame-v2.8` 内同一命令：**46/46 通过**
- 音频：**24/24 加载通过**，`bad=0`
- `node --check game.js`：通过
- zip SHA-256 校验：通过

测试覆盖的功能：

- 第三人称/摄像机/回看基础状态
- 第一次揭示、错手、回看 23:06、重建对齐
- 仪轨显影（三目标）、电量消耗、照片拍摄
- 案板打开/关闭
- 错误起仪 → loop
- 正确起仪 → done
- 第二章 / 找到一次 / 第三章 / 拍一张 / 第四章
- 结局状态与重启

### 4.2 截图 / 视觉证据

- `store/03h_chapter2.png`：第二遍找她，椅子空了
- `store/03i_hunt.png`：取景器“她在帘子后面”
- `store/03j_chapter3.png`：第三遍拍异常，房间变暗
- `store/03k_anomaly.png`：取景器：香炉本来该是三炷
- `store/03l_hide.png`：第四遍躲她，她站在房间中央
- `store/03m_hide_scan.png`：取景器：她正看着帘子后面
- `store/03n_final.png`：最后一遍先拍她
- `store/03o_quiz.png`：回看校验「这盘带是哪一年」
- `store/03p_corridor.png`：门后走廊与电话
- `store/03f_scan.png`：香炉显影三炷 vs 房间二炷
- `store/03g_photo.png`：照片边缘多一只手
- `store/03d_scare.png`：站立人影
- 另外 13 张标题/场景/DV/回看/暂停/结局图

### 4.3 没有验证的部分

- **没有真人完整计时**；10–15 分钟是估算。
- **没有做完整真实键盘回归矩阵**。测试直接调用 `startChapter` / `interact` / `takeAnomalyPhoto` / `hideInteract`，没有模拟按键序列。
- **没有跨浏览器人工验证**（Chrome / Edge / Safari）。
- **没有真实音频试听**；只验证了 `readyState`/media error。
- **没有移动端/触控验证**。
- **没有商业素材授权确认**。

---

## 5. 已知限制与风险

### 5.1 玩法层面

1. **第三遍“拍异常”可能太隐晦**
   房间改成香1/水右/线低，但玩家不一定记得第一遍的正确值；提示/案板是否够清楚未实测。

2. **没有失败惩罚**
   找错位置只会换位置，拍错只会没反应。缺少 P.T. 那种“被抓住/重来”的压力。

3. **取景器直接报位置**
   文字“她在帘子后面”降低了搜索感；如果希望更恐怖，应只给手/影，不给文字。

4. **10 分钟未实测**
   熟练玩家可能 8 分钟通关。结构上有五遍，但内容量仍偏薄。

5. **照片/电量平衡未实测**
   三张照片 48% 电，加上显影/扫视，可能让玩家在第三章无法拍照；目前电尽可回充，但节奏未调。

### 5.2 实现 / 测试风险

1. **按键链路未集成测试**
   已完成一次真实键盘全流程；但 T1–T10 矩阵（重开/连发/失焦/着色器/三结局）尚未全部自动化。

2. **章节切换依赖 `setTimeout`**
   `startChapter` 用 700ms 黑场；期间锁 `transition`，但如果玩家暂停/切标签页，时序可能不直观。未人工测试。

3. **回看/摄像机中的章节切换**
   `startChapter` 会强制 `exitReview` / 关摄像机；这条路径没有人工验证。

4. **单文件 `game.js` 较大**
   5,652 行，后续改动容易互相影响；没有模块化/类型检查/单元测试框架。

5. **无 git**
   没有版本控制；建议接手后先 `git init` 并提交 v2.8 基线。

### 5.3 平台 / 发行风险

1. **Safari `file://` 媒体策略**
   未验证；可能需要本地服务器或调整。

2. **移动端**
   没有触控移动/视角；HUD 按钮只能完成部分操作。

3. **占位素材**
   DV 片段、老妇面部、Key art、音效、音乐、语音均为 MiniMax Design 生成/程序化占位；商业发行前需替换或确认条款。

4. **商店截图数量与 README 表不一致**
   `store/` 有 25 张，README 主表只嵌了 20 张；不影响运行，但审阅时注意。

5. **检查清单中的人工项仍未勾**
   包括 Chrome/Edge/Safari、耳机试听、分辨率、闪烁安全、商店视频、itch 上传。

---

## 6. 建议的接手 / 审阅步骤

### P0：先判断“够不够 10 分钟”
1. 找 3 个没看过的人，完整玩 v2.8，记录：
   - 总时长
   - 每遍时长
   - 卡住的位置
   - 是否觉得第三遍太隐晦
2. 如果中位数 < 10 分钟：优先加内容，而不是继续加 UI。
3. 如果 > 12 分钟但觉得拖：删减找她/拍异常的次数。

### P0：把第三遍做得不一样
当前建议二选一：
- **追逃**：放下 DV 后她会换位置/靠近；被靠近就黑场回本章开头。
- **不能看太久**：取景器里看她越久，她越近；拍照需要“背对她”/关灯等反转。

### P1：加失败与压力
- 找她/拍异常时被抓住 → 回到本章开头（保留已找到/已拍数量或清空，二选一）。
- 电量耗尽 → 本章强制用实物线索，或直接进入坏结局分支。

### P1：真实按键 + 章节切换测试
- 用 Playwright/Chrome DevTools 模拟 `F/L/E/Space`，跑完整五遍。
- 覆盖：章节切换时暂停、回看中切换、摄像机中切换、电尽强制关镜头。

### P2：平台与发行
- Safari/Edge/Chrome 手动跑。
- 耳机试听 24 个音频，确认循环接缝。
- 决定是否做设置持久化/移动端/手柄。
- 替换/授权占位素材。

---

## 7. 复现与调试

### 启动

```bash
cd ji_third_person_demo
# 直接双击 index.html，或：
open index.html
```

### 自测

```bash
node --check game.js

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --use-angle=swiftshader --ignore-gpu-blocklist \
  --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir=/tmp/ji_qa --virtual-time-budget=40000 \
  --dump-dom "file://$PWD/index.html?nointro=1&test=1" | grep -o 'TEST PASS'
```

### 音频

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --use-angle=swiftshader --ignore-gpu-blocklist \
  --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir=/tmp/ji_audio --virtual-time-budget=15000 \
  --dump-dom "file://$PWD/index.html?nointro=1&novideo=1&audiodbg=1" | grep -o 'AUDIO PASS'
```

### 常用调试参数

| 参数 | 作用 |
| --- | --- |
| `?nointro=1&test=1` | 跑 40 项自测 |
| `?nointro=1&chapter=2` | 直接进第二遍 |
| `?nointro=1&chapter=2&huntcam=1&huntpos=0` | 第二遍取景器，看她位置 0 |
| `?nointro=1&chapter=3&huntcam=1` | 第三遍取景器：香炉异常（自动站位到香炉旁） |
| `?nointro=1&chapter=4` | 直接进第四遍躲她 |
| `?nointro=1&chapter=4&huntcam=1` | 第四遍取景器看她的视线 |
| `?nointro=1&review=1&pos=0.4` | 直接进 23:06 回看校验 |
| `?nointro=1&corridor=1` | 直接进走廊 |
| `?nointro=1&scan=1` | 第一遍香炉显影 |
| `?nointro=1&scan=2` | 第一遍水碗显影 |
| `?nointro=1&scan=3` | 第一遍门框显影 |
| `?nointro=1&case=1` | 打开展示用供桌记录 |
| `?nointro=1&photo=1` | 展示照片多一只手 |
| `?nointro=1&bad=1` | 直接看坏结局 |
| `?nointro=1&noui=1` | 隐藏 prompt/字幕做截图 |
| `?nointro=1&novideo=1&audiodbg=1` | 音频加载检查 |

---

## 8. 审阅结论模板

审阅时建议直接回答这四个问题：

1. **时长**：完整玩一遍多少分钟？中位数是否 ≥ 10？
2. **看懂了吗**：第三遍“拍异常”是否看懂香1/水右/线低哪里不对？
3. **恐怖**：有没有至少一个让你不舒服/印象深的桥段？是站立人影、取景器里的脸、照片手，还是别的？
4. **可玩性**：有没有一个时刻是你自己“想明白/做决定”的，而不是跟着提示走？

如果第 1 题 < 10，或第 2 题“没看懂”，下一轮优先改第三遍/提示，而不是继续加截图和文案。
