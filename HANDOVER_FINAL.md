# 《祭：她在画面里》完整交接报告

> **版本**：v2.8 · audit hotfix  
> **仓库**：<https://github.com/foxmuldery/ji-she-in-frame>  
> **发布**：<https://github.com/foxmuldery/ji-she-in-frame/releases/tag/v2.8.0>  
> **交接日期**：2026-10-21  
> **状态**：可运行、可完整通关的技术基线；**不是 10 分钟成品，暂不建议按 10 分钟产品验收或商业上架**。

---

# 0. 一页结论

## 0.1 这是什么

一个纯静态、离线可玩的 found-footage 心理恐怖 vertical slice：

- 真等距 12×9 像素房间，480×270 内部分辨率
- 第一人称旧带 DV 取景器，640×480 内部画面
- P.T. 式五遍循环 + 门后走廊 + 23:06 回看校验
- 两个主结局 + 一个坏结局
- 无构建、无后端、无框架、无联网依赖
- `index.html` 双击即可运行（`file://`），也可用静态服务器

## 0.2 当前基线

| 项目 | 结果 |
| --- | --- |
| 源码自测 | **46/46** |
| 发布包自测 | **46/46** |
| 运行时音频 | **24/24，bad=0** |
| 真实按键完整通关 | **help 结局**；独立复核 **84.3s**，本地 **85.5s** |
| 三个结局 | help / film / bad 均已由真实按键验证 |
| 已知 P0 | 无 |
| 10 分钟目标 | **FAIL**（当前最优约 84–86 秒） |
| 浏览器覆盖 | Chromium headless 为主；Safari/Edge 人工未完成 |
| 商业素材 | 占位/AI 生成，未完成替换/授权 |
| 版本控制 | v2.8 起有 GitHub 仓库；此前历史不可恢复 |

## 0.3 接手后先做什么

1. 克隆仓库，打开 `index.html` 玩一遍。
2. 读 `audit/AUDIT_REPORT.md`、`audit/FIX_VERIFICATION.md`、`audit/FIX_REPORT.md`。
3. 跑一次 46 项自测与 24 项音频检查。
4. **不要先做 10 分钟验收**；先按第 11 节做内容扩充。
5. 任何内容改动后，重新跑真实按键三结局与第 10 节回归清单。

---

# 1. 交付物与入口

## 1.1 GitHub

- 仓库：<https://github.com/foxmuldery/ji-she-in-frame>
- 默认分支：`main`
- 发布标签：`v2.8.0`
- 发布资产：`ji-she-in-frame-v2.8.zip`
- 仓库可见性：public

## 1.2 两种运行方式

### A. 直接下载发布包（推荐给试玩者）

1. 打开 <https://github.com/foxmuldery/ji-she-in-frame/releases/tag/v2.8.0>
2. 下载 `ji-she-in-frame-v2.8.zip`
3. 解压
4. 双击 `ji-she-in-frame-v2.8/index.html`
5. 推荐 Chrome / Edge / Safari 桌面版，戴耳机

### B. 从源码运行（开发者）

```bash
git clone git@github.com:foxmuldery/ji-she-in-frame.git
cd ji-she-in-frame
# 直接双击 index.html，或：
python3 -m http.server 8000
# 打开 http://localhost:8000/
```

无需 `npm install`、无需构建、无需联网。

## 1.3 包校验

```text
zip SHA-256:
fdf9020febe6c6cee468665fdf06ce515aedf8190c4d34b900b86689f08c47ea

game.js SHA-256:
71aaaac30fce820ae881b716b49f5fcf89685352f5514aefd8e7235e554816a4
```

仓库不提交 `dist/` 与 zip；发布包只作为 GitHub Release 资产。

---

# 2. 产品定义

## 2.1 一句话

> 你以为自己在拍她；回看时才发现，第三人称里的“你”是另一个人补出来的。

## 2.2 类型与目标

- found-footage 心理恐怖
- 等距探索 + 第一人称 DV
- P.T. 式短循环 / 环境解谜
- 目标时长：10–15 分钟
- 当前最优：约 84–86 秒
- 目标玩家：喜欢《P.T.》《Layers of Fear》《Simulacra》式短篇的 PC 玩家

## 2.3 核心区别

游戏不是“第三人称走路 + 偶尔举相机”。它把两种视觉做成两套规则：

| 第三人称探索 | 第一人称 DV |
| --- | --- |
| 看房间、找物件、调整供桌 | 看“带子里的房间” |
| 看到的是现在的房间 | 看到的是被剪过/被重建的房间 |
| 用来移动、互动、躲藏 | 用来显影、找她、拍异常、看视线 |
| 老妇在椅子上/中央 | 取景器里多出拍摄者、错手、缺失帧 |

恐怖点来自两者不一致，而不是 jump scare 数量。

## 2.4 内容提示

尸体、血迹、惊悚暗示、突然音效、磁带闪烁。无血腥特写。  
暂停菜单可开「闪烁效果：柔和」。

---

# 3. 快速上手

## 3.1 操作

| 操作 | 键 |
| --- | --- |
| 移动 / 走廊前进后退 | `W A S D` / 方向键 |
| 互动 / 调整 / 找到她 / 躲 / 接电话 | `E` |
| 起仪（提交摆法） | `空格` |
| 供桌记录 | `Tab` |
| 举起 DV / 显影 / 找她 / 看异常 / 看视线 / 拍她 | 按住 `F` / 鼠标右键 |
| 快门 | `L` |
| 回看旧带 | `R` |
| 让她抬手 | `Q` |
| 倒带 / 逐帧 | `A / D` |
| 回看校验选项 | `1 / 2 / 3`（含小键盘） |
| 暂停 / 本次用时 | `Esc` |
| 静音 | `M` |

## 3.2 第一次玩的 60 秒

1. 标题页点「开始」。
2. `W/D` 走到老妇旁，按 `E`。
3. 按住 `F` 约 2 秒，第一次看见取景器里的谢雨洁和拍摄者徐英子。
4. 松开 `F`，等她回头。
5. 走到香炉/水碗/门框，按住 `F` 1.2 秒显影：
   - 香炉：香三
   - 水碗：水左
   - 门框：线高
6. 按 `E` 把供桌调成 3 / 左 / 高。
7. 走到供桌前按 `空格` 起仪。

---

# 4. 完整流程

## 4.1 第一遍 · 供桌

目标：把香、水、线摆成“乙”。

- 老妇坐在椅子上。
- 第一次举 DV：取景器里是谢雨洁，拍摄者显示徐英子；放下后她回头。
- `R` 看旧带 18:06：旧带说“甲：香二、水中、线低”，这可能是假的。
- 对三个实物按 `F` 显影 1.2 秒，得到正确值：
  - 香炉 = 三
  - 水碗 = 左
  - 门框 = 高
- 按 `E` 调整；显影时按 `L` 可拍一张照片（耗电，照片里多一只手）。
- 站到供桌前按空格起仪。
- 摆错 → 第二遍；连续错三次 → 坏结局「她替你摆好了。」

## 4.2 第二遍 · 找她

- 房间重置，椅子空了。
- 按 `F`：取景器显示她在帘子后 / 供桌下 / 椅子后。
- 松开 `F`，走到对应位置按 `E`。
- 找错：“这里只有灰”，她会换位置。
- 找到 3 次进入第三遍。

## 4.3 第三遍 · 拍异常

- 房间变暗，三处被改：香一、水右、线低。
- 对三处按 `F`，取景器显示“本来该是香三/水左/线高”。
- 按 `L` 拍下 3 处异常。
- 拍满进入第四遍。

## 4.4 第四遍 · 躲她

- 她站在房间中央。
- HUD：`第 N/3 轮 · 12.0s`。
- 按 `F` 看她正看着哪个藏点，红色虚线连过去。
- 放下 `F`，在 12 秒内躲到另外两个地方之一按 `E`。
- **每轮不能躲上一次的同一个藏点**；躲错/超时黑场重来当前轮。
- 躲开 3 轮进入第五遍。

## 4.5 第五遍 · 拍她 / 电话 / 手

- 她还站着。走近按 `F`、`L` 拍下。
- 电话响。走到门口按 `E` 进入门后走廊。
- `W` 走到尽头，按 `E` 接电话；电话说“别让她抬手”。
- 回到房间，她坐回椅子；按 `Q` 让她抬手。
- 再按住 `F`：取景器里是另一只手。

## 4.6 23:06 回看校验

- 按 `R` 回看，`A/D` 倒带到 23:06 空白。
- 按 `1/2/3` 回答：
  1. 这盘带是哪一年？→ **1999**
  2. 23:06 缺的是哪一帧？→ **白胶布的手**
- 答错：glitch + 呼吸 + 跳带，不锁死。
- 两题都对：解锁重建条；拖动对齐 23:06；`P` 分屏。

## 4.7 结局

| 结局 | 触发 |
| --- | --- |
| 「你走过去了。」 | 回看后走近老妇按 `E` |
| 「你一直在拍她。」 | 回看后再按住 `F` 拍第二条 |
| 「她替你摆好了。」 | 三次起仪都错 |

三张照片（香炉/水碗/门框）集齐时，主结局末尾追加：“三张照片里，站在你身后的人，是徐英子。”

---

# 5. 技术架构

## 5.1 运行约束

- 纯静态：`index.html` + `style.css` + `game.js` + `assets/`
- 无 ES modules、无 `fetch`、无构建
- 目标：`file://` 双击可玩
- 音频：`HTMLAudioElement`（避免 `decodeAudioData` 的 CORS）
- 视频：`<video>` + 2D canvas 抽帧；`file://` 下不抽帧进 WebGL，避免 taint

## 5.2 三层画面

| 层 | 实现 | 分辨率 |
| --- | --- | --- |
| 等距房间 | `#pixel` Canvas 2D | 480×270 |
| DV / 回看 | `#camera` Canvas 2D | 显示 1280×960，内部 640×480，2× transform |
| HUD | DOM + CSS | 自适应 stage |

CRT：

- RetroZone WebGL overlay（MIT）在可用时叠加
- CSS 扫描线/暗角兜底
- 脸部图使用 data URI，避免 `file://` 污染 canvas

## 5.3 状态机

`state` 是单一可变对象，核心字段：

| 字段 | 含义 |
| --- | --- |
| `chapter` | 1–5；供桌/找她/拍异常/躲她/拍她 |
| `scene` | `room` / `corridor` |
| `ritual` | 香/水/线、loop、camSeen、inspected |
| `hunt` | 找她/拍异常 |
| `hide` | 躲她：round/facing/remaining/lastSpot |
| `corr` | 走廊 depth/answered/ringAt |
| `finalPhoto`/`phoneDone` | 第五遍状态 |
| `battery`/`photos` | 电量、三张照片 |
| `reviewQuiz` | 23:06 校验 |
| `runStart`/`runEnd`/`chapterTimes` | 计时 |
| `runId` | 重开代际，旧任务作废 |
| `transition`/`pauseQueued` | 黑场与排队暂停 |

## 5.4 主循环

`frame(now)`（`game.js:5571`）：

1. `dt = min(0.05, now-last)`
2. 未暂停时 `state.time += dt`，`tickJobs()`
3. 走廊分支：`updateCorridor` → 画走廊 → 返回
4. 回看分支：倒带/逐帧 → 画回看 → 返回
5. 移动：`!camera && !ending && !caseOpen && !transition && !inputLock`
6. `updateBattery(dt)` / `updateHide(dt)`
7. 画房间/摄像机、HUD、提示

## 5.5 游戏时间调度器

`later(fn, ms)`（`game.js:262`）不直接使用真实时间，而是：

```js
jobs.push({ id, at: state.time + ms/1000, fn, run: state.runId })
```

- `tickJobs()` 在 `frame` 内执行
- 暂停时 `state.time` 不前进 → 剧情计时自然保留
- `cancelLater(id)` 取消字幕/提示任务
- 每个 job `try/catch`，单个异常不会中断渲染循环
- `runId` 在 `reset()` 自增，旧局任务全部作废

音频淡出使用原生 `setTimeout`，因为媒体播放按真实时间走。

## 5.6 关键函数

| 函数 | 位置 | 作用 |
| --- | --- | --- |
| `startChapter(n)` | 4463 | 黑场、章节状态、HUD、开场文案 |
| `endTransition()` | 4459 | 统一处理转场结束与排队暂停 |
| `setCamera(on)` | 3651 | 举/放 DV、揭示、电量、场景守卫 |
| `startReview()` | 3935 | 回看、场景/转场守卫 |
| `reviewPick(n)` | 3882 | 23:06 两题校验 |
| `drawReviewQuiz()` | 5153 | 选项与提示同源绘制 |
| `hideFail()` | 4697 | 躲她失败、黑场重来 |
| `hideInteract()` | 4718 | 躲藏判定、`lastSpot` |
| `takeAnomalyPhoto()` | 4815 | 第三遍拍异常 |
| `takeFinalPhoto()` | 4839 | 第五遍拍她 |
| `startCorridor()` | 4527 | 走廊转场 |
| `pauseGame()` | 5788 | 暂停、收 DV、排队暂停 |
| `frame()` | 5571 | 主循环 |

---

# 6. 仓库结构

```text
ji-she-in-frame/
├── index.html                 入口 / HUD / 标题 / 暂停 / 结局
├── style.css                  CRT / HUD / 案板 / 章节 HUD / 无障碍
├── game.js                    全部运行时逻辑（6,234 行）
├── README.md                  GitHub / itch 门面
├── HANDOVER_FINAL.md          本文件
├── HANDOVER.md                开发交接（历史细节）
├── EVALUATION_HANDOVER.md     第三方评估报告（时长 FAIL）
├── DEVLOG.md                  版本历史
├── RELEASE_CHECKLIST.md       上架检查
├── RIGHTS.md                  版权/素材/授权声明
├── assets/
│   ├── audio/                 24 个运行时音频 + 源文件
│   ├── images/                Key art / poster / favicon
│   ├── references/v2/         老妇面部等参考图
│   ├── video/                 5 秒 DV 占位片段
│   ├── face_data.js           脸部 data URI（防 canvas 污染）
│   ├── poster_data.js         poster data URI
│   └── CREDITS.md
├── vendor/
│   ├── retrozone-shader.js    MIT CRT shader
│   └── retrozone-LICENSE.txt
├── audit/
│   ├── AUDIT_REPORT.md        原始 399 行审计
│   ├── FIX_REPORT.md          B1–B8 / N1–N3 / R1–R4 修复记录
│   ├── FIX_VERIFICATION.md    三次独立复核
│   ├── e2e_findings.md
│   ├── code_render_findings.md
│   └── shots/                 审计截图
├── store/                     25 张商店截图 + 封面 + itch 文案
├── dev/archive/               早期开发归档（不是 v2.4）
└── .gitignore                 排除 dist、shots、zip、DS_Store
```

`dist/` 与 13MB zip 不提交到 git；通过 GitHub Release 分发。

---

# 7. 验证证据

## 7.1 内置自测

```bash
cd ji-she-in-frame
node --check game.js

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --use-angle=swiftshader --ignore-gpu-blocklist \
  --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir=/tmp/ji_qa --virtual-time-budget=50000 \
  --dump-dom "file://$PWD/index.html?nointro=1&test=1" | grep -o 'TEST PASS'
```

结果：46/46。

> headless 下偶尔需要更长 virtual-time budget 或重试；这是媒体解码时序问题，不是测试失败。

## 7.2 音频

打开：

```text
index.html?nointro=1&novideo=1&audiodbg=1
```

页面标题应为 `AUDIO PASS`；结果 24/24，bad=0。

## 7.3 真实按键

独立复核使用 Playwright 在 `file://` 下真实 `keydown/keyup`，不做 `state` 绕过：

- B1–B8：全部通过
- N1–N3：全部通过
- R1–R4：全部通过
- help / film / bad 三结局：全部真实按键到达
- 20 个真实按键用例 + 探针：通过
- 0 pageerror

## 7.4 时长

| 来源 | help 用时 |
| --- | --- |
| 本地 v2.7 真实键盘 | 85.5s |
| 独立复核 v2.7 | 84.3s |
| 章节参考 | 24.5 / 13.3 / 11.0 / 9.6 + 回看 |

结论：**远低于 10 分钟**。这不是“还没测”，而是“已测且不达标”。

---

# 8. 已知问题与风险

## P0（阻断）

无。当前真实按键可完整通关三个结局。

## P1（影响验收）

1. **内容量不足**
   - 最优约 84–86 秒，目标 10–15 分钟。
   - 第二到第四遍仍偏短；谜题答案偏直白。
   - 需要按 `audit/AUDIT_REPORT.md` 第 5.2 节扩充。

2. **未做 10 分钟真人验收**
   - 现有数据是技术跑图，不是 3 名首次玩家中位数。
   - 内容扩充后必须重新计时。

3. **T1–T10 真实按键矩阵未全部入库**
   - 复核脚本在 `/tmp/ji_verify`、`/tmp/ji_audit`，未提交。
   - 建议搬进 `dev/e2e/` 并接入 CI/打包前检查。

4. **跨浏览器未完成**
   - 仅 Chromium headless 为主。
   - Safari `file://` 媒体策略、Edge、移动端未验证。

## P2（体验/工程）

5. **低帧率下游戏时间变慢**
   - `dt` 上限 0.05；低于 20fps 时字幕/剧情按比例变慢。
   - 需要 lite 模式/性能优化。

6. **HUD 可访问性**
   - 字号偏小、系统字体回退、部分焦点/Tab 行为仍可打磨。
   - 闪烁柔和开关已有，但未做光敏用户测试。

7. **调试代码随包**
   - `runTest`、`?chapter=`、`?review=` 等调试入口仍在发布包。
   - 体量约 330 行；建议构建时剥离。

8. **单文件 6,234 行**
   - 全局可变 `state`，20 个左右不可达函数，部分空 catch。
   - 可维护性一般；内容扩充前建议先拆模块。

9. **资源体积**
   - 仓库约 52MB assets + 12MB store；运行时包 13MB。
   - 未做纹理/音频压缩与按需加载。

10. **无存档/设置持久化**
    - 刷新回标题；静音/闪烁设置不保存。
    - 短篇可接受，但不是成品体验。

11. **移动端/手柄不支持**
    - 仅键盘/鼠标。

12. **基线归档缺失**
    - v2.4/v2.5/v2.6/v2.7 包已删除；仅有当前 v2.8 release。
    - 旧审计基线无法复现；不要再覆盖 release。

---

# 9. 素材与授权

## 9.1 当前状态

| 类别 | 来源 | 状态 |
| --- | --- | --- |
| 代码 / 像素场景 / 交互 | 本项目 | 原始实现 |
| DV 5 秒片段 | 占位素材 | 商业发行前替换 |
| 老妇面部 / 等距参考 / Key art | MiniMax Design 生成/程序化 | 商业发行前替换或确认授权 |
| 音乐 / 音效 / 语音 | MiniMax Design（seedaudio / minimax_music / minimax_tts） | 确认商用条款或替换 |
| CRT shader | RetroZone，MIT | 保留 LICENSE |
| 字体 | 系统字体 | 无嵌入授权问题 |

## 9.2 重要声明

- 仓库是 **public**，但不等于开源授权。
- 代码、剧情、像素场景、商店素材的版权归项目作者；未授予商业再分发许可。
- AI 生成素材的商用条款需单独确认。
- 详见 `RIGHTS.md` 与 `assets/CREDITS.md`。

---

# 10. 发布流程

## 10.1 打包

```bash
cd ji_third_person_demo
node --check game.js

rm -rf dist/ji-she-in-frame-v2.8
mkdir -p dist/ji-she-in-frame-v2.8/assets/{audio,images,references/v2,video}
cp index.html style.css game.js dist/ji-she-in-frame-v2.8/
cp assets/poster_data.js assets/face_data.js dist/ji-she-in-frame-v2.8/assets/
cp assets/audio/*.mp3 assets/audio/*.wav dist/ji-she-in-frame-v2.8/assets/audio/
cp assets/images/* dist/ji-she-in-frame-v2.8/assets/images/
cp assets/references/v2/*.png dist/ji-she-in-frame-v2.8/assets/references/v2/
cp assets/video/footage_clip_5s.mp4 dist/ji-she-in-frame-v2.8/assets/video/
cp vendor/* dist/ji-she-in-frame-v2.8/vendor/
cp assets/CREDITS.md dist/ji-she-in-frame-v2.8/

cd dist
zip -r -X ji-she-in-frame-v2.8.zip ji-she-in-frame-v2.8
shasum -a 256 ji-she-in-frame-v2.8.zip | tee ji-she-in-frame-v2.8.zip.sha256
```

## 10.2 发布

```bash
gh release create v2.8.0 \
  dist/ji-she-in-frame-v2.8.zip \
  --repo foxmuldery/ji-she-in-frame \
  --title "v2.8.0 — audit hotfix" \
  --notes "P0 B1–B8, N1–N3, R1–R4 closed; 46/46 tests; 24/24 audio; 3 endings verified. Still ~85s, not a 10-minute product."
```

## 10.3 原则

- 不覆盖旧 release；每个版本单独 tag + asset。
- `dist/` 不提交；release 资产是唯一分发入口。
- 每次发布前必须跑 46/46、24/24、至少一遍真实按键 help。
- 内容改动后，补 film/bad 与 T1–T10。

---

# 11. 路线图：从 85 秒到 10 分钟

## 11.1 目标

- 首次玩家中位数 ≥10 分钟
- 不看攻略能完成
- 至少 2 个有效恐怖桥段
- 不靠重复取景器拖时间

## 11.2 建议优先级

### S1（1–2 天）：先让第一遍“必须看”

- 显影/拍照改为起仪必需，而不是可选。
- 旧带“甲”与实物“乙”的冲突做成可推理线索，而不是直接字幕报答案。
- 目标：第一遍 4–5 分钟。

### S2（2–3 天）：第二到第四遍各加一个独有动词

- 第二遍：找她时，房间会随她移动而改一处布局。
- 第三遍：拍异常要选择“拍哪一帧”，不是对准就拍。
- 第四遍：躲她时加入声音诱导/假视线，不能只看红线。
- 目标：每遍 1.5–2.5 分钟。

### S3（2–3 天）：走廊与回看

- 走廊加 2 个可互动门/声音，不是纯 W。
- 回看校验加第三题，或让玩家自己剪一帧。
- 目标：第五遍+回看 3–4 分钟。

### S4（1 周）：内容第二幕

- 新房间/新供桌/新磁带，形成 2 个完整段落。
- 目标总时长 12–15 分钟。

## 11.3 验收指标

- 3 名首次玩家，计时中位数 ≥10 分钟
- 至少 2 人不需要口头提示完成第一遍
- 三个结局都可达
- 0 阻断 bug
- 音频/画面在 1280/1920/2560 下正常

---

# 12. 接手检查清单

## 第一天

- [ ] clone / 下载 release
- [ ] 双击 `index.html`
- [ ] 完整玩一遍 help
- [ ] 跑 46/46
- [ ] 跑 24/24
- [ ] 读 `audit/FIX_VERIFICATION.md` §4.7

## 第一周

- [ ] 真实按键复验 film/bad
- [ ] 把复核脚本搬进 `dev/e2e/`
- [ ] 建立 GitHub Actions 或本地打包脚本
- [ ] 评估 S1 改造
- [ ] 决定是否替换占位素材

## 内容扩充前

- [ ] 给 `game.js` 拆模块（至少拆 state/input/render/audio/chapters）
- [ ] 移除调试参数或做 build flag
- [ ] 给 46 项测试补真实按键层
- [ ] 统一 HUD 字号/焦点
- [ ] 设计存档/设置持久化

---

# 13. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 打开黑屏 | 资源路径不对 / 未解压完整 | 确认 `index.html` 与 `assets/` 同级 |
| 没声音 | 浏览器自动播放限制 | 先点「开始」；再按 `M` 检查静音 |
| 视频不播 | Safari `file://` 媒体策略 / 编码 | 用 Chrome，或本地静态服务器 |
| 画面没有 CRT | 显卡/WebGL 不可用 | CSS 兜底应仍在；看 `#retrozone-overlay` |
| 字幕闪一下就没了 | 旧 v2.6 回归 | 用 v2.8；R-1 已修 |
| 第四遍躲不过 | 12 秒 + 必须换点 | 先按 F 看视线，再选另一个点 |
| 回看题按错 | 选项是 1999 / 白胶布的手 | 按 `2`、`3` |
| 测试偶尔失败 | headless 媒体时序 | 提高 virtual-time budget 到 50s，重试 |
| 字体/布局异常 | 系统缺字体 | 用 Chrome/Safari 桌面版 |

---

# 14. 关键数据

| 项目 | 数值 |
| --- | --- |
| `game.js` | 6,234 行 / 约 265KB |
| `style.css` | 495 行 |
| `index.html` | 207 行 |
| 运行时音频 | 24 |
| 商店截图 | 25 张 1280×720 |
| 发布包 | 38 个文件 / 13MB |
| 源码资产 | 约 52MB |
| 商店素材 | 约 12MB |
| 审计证据 | 约 3.2MB |
| 内置测试 | 46 |
| 真实按键复核实测 | 20 用例 |
| 当前最优时长 | 84–86 秒 |

---

# 15. 联系与 Credits

- 作者/账号：`foxmuldery`
- 仓库：<https://github.com/foxmuldery/ji-she-in-frame>
- 发布：<https://github.com/foxmuldery/ji-she-in-frame/releases/tag/v2.8.0>
- 素材/授权：见 `assets/CREDITS.md`、`RIGHTS.md`
- 审计：`audit/AUDIT_REPORT.md`、`audit/FIX_VERIFICATION.md`

---

# 16. 交接签署

```text
接手人：
日期：
平台 / 浏览器：
是否离线启动：
46/46：
24/24：
help 结局：
film 结局：
bad 结局：
首次玩家计时（如适用）：
阻断 bug：
非阻断 bug：
是否建议进入内容扩充：
备注：
```

---

**报告结束。**

> 这份报告描述的是 v2.8 的真实状态：  
> **技术基线稳定，三个结局可通关；但内容只有约 85 秒，10 分钟目标未达标。**  
> 不要把“46/46”误读成“产品完成”；它只证明当前功能与关键回归通过。
