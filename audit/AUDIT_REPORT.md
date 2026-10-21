# 《祭：她在画面里》v2.4 — 多维审计与可执行优化报告

> 审计日期：2026-10-20（Asia/Shanghai）
> 审计对象：`ji_third_person_demo/`（源码）与 `dist/ji-she-in-frame-v2.4/`（发布包）
> 基线校验：zip SHA-256 `7007ce49…c6f5`、`game.js` SHA-256 `f9ec0d98…2662`，源码与发布包一致（已复核，37 个文件）
> 方法：① 人工通读核心逻辑（game.js 3250–3970、4407–4886、5000–6153）；② 用 Playwright 驱动 Chrome 做**真实键盘/鼠标**端到端试玩；③ 渲染、性能、代码结构、资源静态审计。
> 证据文件：`audit/e2e_findings.md`（端到端）、`audit/code_render_findings.md`（渲染/代码）、`audit/shots/`（截图）

---

## 0. 结论

**v2.4 目前不具备第三方评估条件。** 交接报告写的是“可完整游玩、46/46 通过”，但内置测试是直接调函数、直接改坐标，绕过了真实输入链路。用真实按键试玩，**普通玩家到不了任何主结局**：

| # | 阻断问题 | 影响 |
| --- | --- | --- |
| B1 | 第一遍第一次放下 DV 后，**角色再也不能移动** | 第一遍卡死，走不到水碗、门框；最多只能在供桌前起仪错三次进坏结局 |
| B2 | 第五遍拍下她之后，**角色同样不能移动** | 走不到门口接电话，第五遍卡死 |
| B3 | 躲她 9 秒倒计时、DV 电量消耗**根本没有接进主循环** | 第四遍没有时间压力；电量机制和“电量见底”整段都触发不到 |
| B4 | 23:06 回看校验的**答案和显示的选项对不上** | 选 1999、白胶布的手都判错；只有选 1998、门才算对，提示文字给的编号又是第三种说法 |
| B5 | “重新开始 / 回到标题”**不会重置章节状态**，旧的计时器也不会取消 | 从第 2/4 遍或走廊重开，新一局直接串到中间的章节，或者跳章 |
| B6 | 按住空格不放，键盘自动连发会**一下起仪三次，直接坏结局** | 普通玩家很容易误触 |
| B7 | 老妇脸部图片以 `file://` 加载，**污染 camera 画布**，RetroZone 着色器抛 SecurityError 后永久停帧 | 开着 CRT 着色器时看不到面部特写；之后所有 DV/回看画面都被一帧冻结的画面盖住 |

把 B1/B2 用调试手段绕过之后，按最优路径打完只要 **≈97.6 秒游戏时间**（第一遍 41s、第二遍 11.6s、第三遍 12.4s、第四遍 7.1s、第五遍+回看 ≈25s）。E2E 按真人摸索取 5–10 倍估算，约 **8–16 分钟**，下限低于 10 分钟；而且第二到第四遍每遍只要 7–12 秒，内容密度明显不够。“13–20 分钟”的结构估算**依据不足**，修完 bug 后必须真人计时，并按第 5 节扩充玩法。

**建议顺序**：先做第 2 节的 Hotfix（约 1.5–2 人日）→ 换掉测试方式，加上真实按键回归（第 9 节）→ 再按第 5 节改游戏性、补时长 → 最后才做第三方试玩计时。

---

## 1. 评分总览

| 维度 | 评分（10 分制） | 一句话 |
| --- | --- | --- |
| 稳定性 | **2** | 两处移动卡死、重开串局、计时器竞态、着色器停帧 |
| 代码 | **4** | 单文件 6153 行，全局可变状态，有死代码，测试工具和调试参数随正式包发布，状态没有统一的初始化工厂 |
| 游戏性 | **4** | 主题和“摄像机 vs 重建”的核心想法很强；但每个谜题都直接把答案写在字幕里，第二到第四遍是同一个动词，第四遍没有压力 |
| 界面 | **6** | 美术氛围统一、有辨识度；HUD 字号 8–10px 偏小，提示文案前后矛盾 |
| 交互 | **3** | 按键过载（E/Q/A/D 一键多义），不处理键盘连发和窗口失焦，暂停冻结不了脚本事件 |
| 交付/文档 | **3** | 交接报告的“可完整通关 / 46/46 通过”误导评估方；没有 git 仓库 |

---

## 2. P0 Hotfix 清单（评估前必须完成）

> 每条都写了：复现步骤 → 根因（file:line）→ 修法 → 验收标准。行号以 v2.4 `game.js` 为准。

### B1 / B2 · `state.choice` 把移动锁死

- **复现（真实按键）**：开始 → W/D 走到老妇旁 → E → 按住 F 约 2.5 秒后松开 → 等她回头 → 再按 WASD，位移 0.00。第五遍：F + L 拍她 → WASD 位移 0.00，E 只会说“电话在门后”。
- **根因**：主循环的移动条件是 `!state.choice`（`game.js:5552`）。`choice` 原本是早期 proof 里“结尾二选一”时锁移动用的，后来加了供桌、章节，这个条件没改：
  - `setCamera(false)` 第一次放下 DV 时把它设成 true（`3717`），直到 `startChapter` 才清掉；
  - `takeFinalPhoto` 又设成 true（`4803`），`answerPhone.back` 也是（`4527`）。
- **修法**：
  ```js
  // frame()：移动只受真正的“锁输入”状态限制
  const canMove = !state.camera && !state.ending && !state.caseOpen && !state.transition && !state.inputLock;
  ```
  `choice` 只保留“结尾分支可用”这一层意思。为了让「你走过去了」名副其实，`choose('help')` 前加上 `nearWoman()` 检查（`5399`）。
- **验收**：真实按键能走到香炉、水碗、门框、供桌、门口；回归测试里要断言“放下 DV 后按 D 600ms，wx 增加 ≥1.0”。

### B3 · `updateHide()` / `updateBattery()` 从来没被调用

- **证据**：全文件只有定义处和 `runTest` 里调用（`3359`、`4706`、`5912`）。所以第四遍 HUD 一直停在 `9.0s`；举着 DV 不掉电；`forceCameraOff`（`3371`）是死代码。
- **修法**：在 `frame()` 房间分支、移动之后加上：
  ```js
  updateBattery(dt);
  updateHide(dt);
  ```
  加上之后要**重新调平衡**：电量 5.5%/s，满电约 18 秒；第一遍显影 3 处约耗 20%，再拍 3 张照片耗 48%，余量可以。倒计时建议先用 12 秒，并在举着 DV 时减速 50%（见 5.4）。
- **附带 bug**：最后一轮躲完以后 HUD 显示“第 4 / 3 轮”（`3341` 用的是 `round+1`），改成 `Math.min(3, h.round+1)`。
- **验收**：第四遍 9（或 12）秒内不躲会黑场重来；举 DV 时电量下降；电量到 0 会自动关镜头并播“电量见底”。

### B4 · 回看校验的答案和选项对不上

| | 键 1 | 键 2 | 键 3 | 代码认定的正确答案 |
| --- | --- | --- | --- | --- |
| 第 1 题，画面（`5123`） | 1998 | **1999** | 2003 | `correct[0]=1` → 1998 ✗ |
| 第 2 题，画面（`5124`） | 空椅子 | 门 | **白胶布的手** | `correct[1]=2` → 门 ✗ |
| 第 2 题，提示条（`3861`） | 白胶布的手 | 空椅子 | 门 | 又是另一种排列 |

- **修法**：选项和答案用同一份数据，画面和提示都从它生成：
  ```js
  const QUIZ=[
    {q:'这盘带是哪一年？',opts:['1998','1999','2003'],ans:1},
    {q:'23:06 缺了哪一帧？',opts:['空椅子','门','白胶布的手'],ans:2}
  ];
  // reviewPick(n): if (n-1===QUIZ[step].ans) …
  // drawReviewQuiz / prompt 都用 QUIZ[step].opts.map((o,i)=>(i+1)+' '+o).join('　')
  ```
- **验收**：真实按 2、3 通过；按 1 跳带；提示条的文字和画面完全一样。

### B5 · 重开不彻底，延迟回调串到新的一局

- **根因**：`reset()`（`5618–5658`）没有重置 `chapter / scene / hunt / hide / corr / finalPhoto / phoneDone / oldWomanGone / darkChapter / anomalies / reviewQuiz / reconOffset / reconAligned / reconEver / chapterStartedAt`。另外有 77 处 `setTimeout`，大部分只检查 `state.ending`，比如：
  - `startRitualScare` 5.6 秒后调用 `startChapter(2)`（`3540`）；
  - 躲她、找她、拍异常结束后 0.9–1.1 秒调用 `startChapter(n)`（`4695 / 4731 / 4762 / 4788`）；
  - `completeRitual` 7 秒后写 `ritual.active`（`3485`）。
  - 典型后果：在第四遍从暂停菜单重开，新一局停在“第 4 遍”的逻辑里，在第一遍场景里按 E 会走 `hideInteract`；在走廊重开，新一局画的是走廊。
- **修法（两步都要做）**：
  1. 用状态工厂：
     ```js
     function freshState(keep){ return { …所有字段默认值…, muted:keep.muted, flashSafe:keep.flashSafe }; }
     function reset(){ cancelAllTimers(); Object.assign(state, freshState(state)); …DOM 复位… }
     ```
  2. 换成游戏时间调度器：这样暂停时脚本也会停，换局后旧回调自动作废。顺带修好 7.3 里的“暂停冻不住脚本”。
     ```js
     const jobs=[]; let runId=0;
     function later(ms,fn){ jobs.push({at:state.time+ms/1000,fn,run:runId}); }
     function tickJobs(){ for(let i=jobs.length-1;i>=0;i--){ const j=jobs[i];
       if(j.run!==runId){ jobs.splice(i,1); continue; }
       if(state.time>=j.at){ jobs.splice(i,1); j.fn(); } } }
     function cancelAllTimers(){ runId++; jobs.length=0; clearTimeout(subtitleTimer); clearTimeout(promptTimer); clearInterval(state.uncannyTimer); }
     ```
     在 `frame()` 中、`state.time+=dt` 之后调用 `tickJobs()`，然后把逻辑相关的 `setTimeout` 全部换成 `later`。字幕淡出这类纯 UI 的计时可以保留。
- **验收**：在每一遍、走廊、回看、黑场转场里分别 “Esc → 重新开始”，新一局 `chapter===1 && scene==='room'`，并且 10 秒内状态不再变化；“结局 → 回到标题 → 开始”同样。

### B6 · 键盘自动连发

- **复现**：站在供桌前按住空格约 0.2 秒 → `loop:3, ending:'bad'`（已复现）。按住 E 时香/水/线会飞快地轮换。
- **修法**：
  ```js
  const REPEATABLE=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  if (e.repeat && !REPEATABLE.has(e.code)) { e.preventDefault(); return; }
  ```
  另外 `wrongRitual` 里要设 `state.inputLock=true`，等黑场和字幕播完（1.5 秒）再解开。
- **验收**：长按空格只起仪一次；起仪错之后 1.5 秒内再按空格没反应。

### B7 · 画布污染导致 CRT 永久停帧

- **根因**（渲染审计已在 headless Chrome + CDP 复现）：`FACE_CLOSEUP_IMG`（`game.js:45-46`）用 `file://` 路径加载。它被画到 `#camera` 上以后（`drawFaceCover` `5141`、特写 `4032`），RetroZone 的 `texImage2D` 抛 SecurityError（`vendor/retrozone-shader.js:661`，没有 try/catch）。之后 rAF 不再调度，但 overlay 还是 `display:block`，`retroStarted=true`，重开也恢复不了。
- **修法**：① 和 `poster_data.js` 一样，把脸图转成 data URI；② 用 `try{…}catch(e){ retro.destroy(); retroDisplay=null; fallbackToCssCrt(); }` 包住 RetroZone 的 render；③ 监听 `webglcontextlost`，走同样的回退。
- **验收**：在 `file://` 下进回看 `look` 段，再切到 `gap`，着色器每秒 render 次数 ≥50；`getImageData` 不报错。

### B8（P0 级的小改动，顺手做）

| 问题 | 位置 | 修法 |
| --- | --- | --- |
| 走廊里按 F/R 会进摄像机或回看，E 失效 | `setCamera 3621`、`startReview 3901` 没检查 `scene` | 两处都加 `if (state.scene!=='room') return;` |
| 暂停时 `choose()` 照样触发，结局叠在暂停菜单上 | `startSecondTake 3803` 等 | 用 `later()` 调度（见 B5） |
| 窗口失焦后按键卡住 | 没有监听 `blur` / `visibilitychange` | `blur` 时清空 `keys` 并放下 DV；`visibilitychange` 隐藏时自动 `pauseGame()` |
| 暂停菜单里仍然每 11 秒 / 9 秒响钟、滴水 | `clockTimer / waterTimer`（`499–507`，`setInterval`） | 回调开头加 `if (state.paused) return;` |
| 章节黑场的 700ms 里按 R 会进回看，而且回看状态会被带进下一遍 | `startReview` 没检查 `transition` | `if (state.transition) return;`；`startChapter.apply` 里再调一次 `exitReview()` |
| 按住 F → Esc → 松开 F → 恢复，DV 仍然举着，扫描风险计时也照走 | 暂停时 `keyup` 被忽略 | 暂停时强制收起 DV（`hardCloseCamera()`） |
| 小键盘的 1/2/3 不能答题 | 只认 `Digit1..3`（`5448`） | 同时接受 `Numpad1..3` |

---

## 3. 稳定性（P1）

1. **转场期间不能暂停**：`pauseGame` 遇到 `transition` 直接返回（`5713`），暂停按钮没有任何反馈。改成先排队，转场结束后再暂停。
2. **不论第几遍，回看退出都给同一句提示**：`exitReview` 固定显示“E 走向她 / 按住 F 继续拍”（`3952`），第一到第四遍会误导玩家。改成按章节生成：`promptFor(state)`。
3. **`completeRitual` 7 秒后写 `ritual.active=false`**（`3485`）：如果这时已经进入第二遍，会把别的状态改掉。用 `later` 并核对章节号。
4. **`hideFail` 黑场的 900ms 里状态没有锁**（`4663–4677`）：这段时间暂停或重开会出现中间态。换成 `later`，`transition` 统一由调度器管理。
5. **全局异常兜底**：加上 `window.onerror` / `unhandledrejection` 处理，出错时在屏幕上提示“按 Esc 回到标题”，并把错误写进 `sessionStorage`，方便评估者附在反馈里。
6. **静默模式 `state.silent` 只给测试用**：它会改变游戏逻辑分支（`3478`、`3499`、`4474`），测试测到的不是玩家实际走的路径。测试应该用正常模式，再配合加速时间（`state.timeScale`）。

---

## 4. 代码（可维护性）

> 详细数据见 `audit/code_render_findings.md`；下面是要执行的结论。

1. **死代码 / 断线函数**：调用图分析找到 20 个不可达函数，共 **665 行（10.8%）**。其中整套旧版矢量摄像机 `drawCameraScene / drawCameraXie / drawCameraRig` 就有 524 行；`C` 调色板也没被用到。断线的 `updateHide / updateBattery / forceCameraOff` 要接回主循环（B3）；`takeHuntPhoto`（`4745`）、`renderHuntScan` 里第三遍专用的分支（`5085/5091`）以及旧矢量摄像机代码删掉。
   - 函数体量前 3 名：`drawCameraPixelScene` 295 行、`renderCameraScan` 137 行、`runTest` 129 行。
   - 34 个 `try`，其中 26 个是空 `catch(e){}`。B7 就是这样被吞掉、一直没人发现的。统一换成 `swallow(tag)`，开发模式下打印出来。
2. **状态初始化写在 3 个地方**：`state` 字面量（`246`）、`reset()`（`5618`）、`startChapter.apply`（`4434`），彼此不一致，B5 就是这么来的。统一用 `freshState()` 和 `chapterDefaults(n)`。
3. **坐标、数值散落在各处**：老妇 `(8.5,2.5)`、供桌 `(7.05,5.25)`、三个目标点的坐标写了两遍（`3428`、`3439`），出生点 `(2.5,6.5)` 写了 4 遍，以及 16% 拍照电量、9 秒、1.2 秒显影、2.8 秒风险时间等。集中成 `const WORLD={…}, TUNING={…}`，这样调平衡只改一个地方。
4. **测试工具和 30 多个调试 URL 参数随正式包发布**（`5816–6146`，约 330 行）。玩家改 URL 就能直接跳结局。建议拆成 `dev.js`，发布脚本不打包它，或者只在 `?dev=1` 时动态加载。
5. **模块化（保持 `file://` 能直接双击运行）**：拆成多个经典 `<script>`，共用一个 `window.JI` 命名空间：
   `core/state.js`（状态、调度器）· `core/input.js` · `audio.js` · `render/room.js` · `render/camera.js` · `render/review.js` · `chapters/ch1_ritual.js … ch5_final.js` · `ui/hud.js` · `dev/test.js`。
   再写一个 20 行的 `build.sh`，把它们 concat 成 `game.js` 放进 dist。章节逻辑做成统一接口：`{enter(), update(dt), interact(), onCamera(on), photo(), exit()}`。这样 `interact()` / `setCamera()` / `takePhoto()` 里那一长串按 `chapter` 分支的 if 就能去掉。
6. **文案集中**：几百条 `say()` / `prompt()` 硬编码在逻辑里，B4 的三处文案不一致就是这么出来的。抽成 `STRINGS` 表，也为以后做英文版铺路（商店页本来就有英文标题）。
7. **语音匹配靠 `text.includes(v.text)`**（`3257`）：改一个字语音就不播了。改成 `say(text,{voice:'voiceHand'})`，显式指定。
8. **版本控制**：立即 `git init`，提交 v2.4 基线，打 tag `v2.4-audit`。之后每个 Hotfix 单独一个 commit。

---

## 5. 游戏性

### 5.1 核心问题：谜题把答案写在字幕里

| 遍 | 现在的解法 | 问题 |
| --- | --- | --- |
| 第一遍 · 供桌 | 走到实物前按 E 就会出字幕“炉身有三个孔 / 左边有水痕 / 高处有绳痕” | **F 显影整套机制可以不用**；而且起仪错两次之后，旧带直接给出正确答案（`drawRitualClue` 的 mercy 分支） |
| 第二遍 · 找她 | 举 F，字幕直接说“她在帘子后面” | 不用找；只是“看字 → 走过去 → 按 E” |
| 第三遍 · 拍异常 | 走到香炉 / 水碗 / 门框旁边举 F 再按 L | 三个点和第一遍完全一样，没有干扰项，不会拍错 |
| 第四遍 · 躲她 | 字幕说“她看着 X”，按 E 躲到另外一处 | 倒计时没接上（B3）；**站在原地也能连躲**；出生点离帘子只有 1.92（判定半径 1.8） |
| 第五遍 · 拍她 / 电话 | 线性流程 | 没问题；但回看校验对结局是**可选的**，跳过也能结束 |

### 5.2 改造方案（目标：真人中位数 ≥12 分钟，不靠拖时间）

**第一遍 · 供桌（目标 4–5 分钟）**
- 把“检查”和“调整”分开：E 只用来调整；实物线索**只有在取景器里显影才能看到**（显影 1.2 秒，耗电）。这样摄像机才是必需的。
- 旧带第三遍不再白给答案，改成给“哪一项是对的”（比如只告诉你“水是对的”）。
- 加 1–2 个干扰物（例如第四样供品：碗筷朝向），每个物件 3 个状态，组合数从 3 种变成 81 种，让玩家真的要靠观察推理。

**第二遍 · 找她（目标 2–3 分钟）**
- 取景器里**不出文字**，只显示她在画面里的局部（衣角、手），玩家要把取景器画面和房间对应起来。
- 增加藏点到 5 个，加上门后、衣架后。
- 她只在“没被拍”的时候移动；放下 DV 时会有方向性脚步声（用 WebAudio 的 StereoPanner）。

**第三遍 · 拍异常（目标 2–3 分钟）**
- 和第一遍拍的照片对比找不同：异常不只在供桌附近，挂衣、日历、钟、脚印都可能被改过。拍错要扣电，3 处真异常里混 2 处诱饵。
- 拍完以后照片陈列在 Tab 记录板上，成为第五遍、回看的线索。

**第四遍 · 躲她（目标 2–3 分钟）**
- 先修好 B3；**每轮必须换一个藏点**（`hideInteract` 加一条：`spot!==h.lastSpot`）。
- 她会朝最后看过的位置**走过去**（第三人称里看得见），压力来自画面，不只来自数字倒计时。
- 举 DV 时倒计时减速 50%，但 DV 会发出“哔”声，她转头的概率提高。看得清和被发现之间要做取舍。
- 失败升级：第二次失败灯灭一盏，第三次失败只剩取景器能看清。

**第五遍 + 回看（目标 2–3 分钟）**
- 结局之前必须完成回看校验（或者用它来决定“真结局”），让 23:06 成为高潮，而不是可以跳过的支线。
- 校验题从“猜年份”改成**从带子里找证据**：比如在 `look` 段逐帧找到白胶布的那一帧按 L 标记，而不是按数字选择题。
- 走廊扩到 2–3 段（电话→门→回到同一个房间，但镜像），呼应 P.T. 的循环感。

### 5.3 恐怖节奏

- 全文件 `playMedia('oldBreath', …)` 有 14 处调用，`glitchNow()` 有 21 处：同一种呼吸 + 故障反复出现，惊吓效果会递减。建议设一个 **scare budget**：每遍最多 1 次强惊吓、2 次弱惊吓，同类音效至少间隔 60 秒，而且每遍的惊吓要换一种（视觉 / 音频 / UI 侵入 / 安静）。
- 最有潜力的桥段：站在身后的老妇（`drawStandingOldWoman`）、照片里多出来的手、HUD 角色名闪烁。值得多做几次变化，比如 HUD 的“拍摄者”字段偶尔换成第三个名字。
- 标题页写着“含尸体、血迹”，但这个切片里没有这些内容。这句警示要和实际内容一致，否则商店审核和玩家预期都会出问题。

### 5.4 平衡参数建议（初值，以试玩数据为准）

| 参数 | 现在 | 建议 |
| --- | --- | --- |
| 显影时间 | 1.2s | 1.5s |
| 盯太久出现“多一个人” | 2.8s | 3.5s，并且真的扣点东西（电量 −10%） |
| 拍照耗电 | 16% | 12% |
| 回充 | 1.4%/s | 0.8%/s，暂停/回看时不回充 |
| 躲她 | 9s（没生效） | 12s，举 DV 时减速 50% |
| 起仪失败上限 | 3 次 | 保留；但第二次失败要明确提示“再错一次她就替你摆” |

---

## 6. 界面

1. **字号**：HUD 用固定 px，`.ritualHint` 8px，`#ritualNote` 9px，`.chapterObj` 10px，`.chapterCount` 10px；2560×1440 下更显得小。改成相对舞台的单位：在 `#stage` 上设 `--u: calc(min(97vw, 97vh*16/9) / 1280)`，字号写 `calc(12 * var(--u))`，最小不低于 12px。中文正文建议 ≥14px（1080p）。
2. **画在画布上的文字**（取景器里的 9–11px 字）显示时会随画布缩放，具体数值见 `e2e_findings.md` 的 UI 部分。关键信息（倒计时、“她看着…”）应该放到 DOM HUD 上，画布里只留氛围性的 OSD 文字。
3. **Windows 字体回退**：sans 字体栈缺 `"Microsoft YaHei","PingFang SC","Noto Sans CJK SC"`；serif 已经有 SimSun。
4. **文案错误 / 不一致**（直接改）：
   - 第三遍按 E：“她在取景器里。举起 F，按 L 拍。”（`5383`）→ 应为“房间被改过。举起 F，对准不对的地方按 L。”
   - 第一遍按 Q：显示“先躲好。”（`3755`，`chapter<5` 的分支不分章节）→ 第一遍应提示“先摆好供桌”。
   - 记录板：“靠近实物，按 E 检查”，而 HUD 写的是“F 显影”。两边要统一，取决于 5.2 选哪套方案。
   - 第三遍取景器右下显示 `PHOTO n/3`（`5006`），统计的是第一遍的照片，应该显示 `state.hunt.count`。
   - `index.html:57` 线的初始值写“中”，实际是“低”（JS 会覆盖，但首帧会闪一下）。
5. **底部操作说明太长**（`#controls`，一行列了 9 个键，而且没有 Q/R/P/1-3）。改成**按章节显示的上下文提示**：只列当前能用的 2–3 个键，完整键位放到暂停菜单的“操作”页。
6. **结局页**：“垂直切片 · 试玩结束”和“完整章节制作中”在商业版里要换掉。建议显示“到达结局 n/3”和“三张照片 n/3”，鼓励重玩。
7. **布局重叠和截断**（DOM 几何量测，截图在 `audit/shots/`）：
   - **标题页上一直显示游戏 HUD**（暂停、DV 按钮、`#controls`），所有分辨率都这样；800×600 下还和标题内容叠在一起。修法：`body:not(.started) #hud, body:not(.started) #controls {display:none}`。
   - **回看界面**：800×600 下 `#subtitle` / `#prompt` / `#timeline` 两两重叠，1024×768 下 prompt 压在时间线上。修法：时间线打开时，字幕和提示上移到 `bottom: calc(timelineHeight + 8px)`。
   - **暂停面板**：内容高 550px，1024×768 下可视 490px、800×600 下 382px，“重新开始”会被截掉。修法：小屏时按钮改成两列，或缩小 `.pauseTitle`。
   - **记录板**：800×600 下要滚动才能看全；1280×720 下背后的仪轨面板和提示仍然透出来，和它重叠。打开记录板时隐藏 `#ritual / #prompt / #subtitle`。
   - `#controls` 固定 737px 宽、不换行，800px 宽的窗口两边只剩约 30px。
   - 画布文字在 800×600 下只有约 8–11px（校验题标题、提示），低于可读下限。
   - 调整窗口大小时舞台缩放正确，没有滚动条，状态也不受影响（通过）。

---

## 7. 交互

1. **按键过载**：
   - E：互动、调整、躲、接电话，回看里又是“重建条 +1%”；
   - Q：让她抬手，回看里又是“重建条 −1%”；
   - A/D：移动，回看里是倒带。
   回看里的微调改用 `←/→` 加 Shift，或者 `[ ]`，Q/E 不再身兼两职。
2. **“按住 F”**：对触控板用户和长时间游玩不友好。增加“切换模式”选项（按一下举起，再按一下放下），右键也同样支持。
3. **鼠标**：`dvBtn` 在 `pointerleave` 时就放下 DV（`5474`），鼠标稍微移出按钮就断了。改用 `setPointerCapture`。
4. **自动连发、失焦**：见 B6 / B8。
5. **暂停**：要冻结所有脚本事件（B5 的调度器）。暂停菜单增加“操作说明”和“返回标题”（现在只有结局页能回标题）。
6. **设置持久化**：静音、闪烁、DV 按住/切换写进 `localStorage`，读不到就用默认值，不影响 `file://`。
7. **存档**：13–20 分钟的短篇至少要有“章节续玩”：开始每一遍时写 `localStorage.ji_ch=n`，标题页出现“从第 n 遍继续”。
8. **手柄**（P2）：Gamepad API 映射 LT=举 DV、A=互动、X=快门、Y=回看、Start=暂停，大约 60 行。
9. **无障碍**：
   - 删掉 `viewport` 里的 `user-scalable=no`；
   - 菜单按钮补焦点样式和键盘导航；字幕加大字号选项；
   - **Tab 在整局游戏里都被劫持成“记录板”**（`5420`），暂停菜单没法用键盘切换按钮；Space 被全局 `preventDefault` 当成“起仪”（`5440`），焦点在按钮上时按 Space 不起作用。修法：`state.paused` 或 `e.target.closest('button')` 时直接 return；
   - 20 个 `<button>` 都没写 `type="button"`；弹层没有 `role="dialog"`，也没有焦点管理；字幕没有 `aria-live`；`#controls` 对比度约 2.3:1（AA 标准是 4.5:1）。
10. **CRT 回退失效**：`#crt{display:none}`，而 `#stage.shader` 这条规则是死 CSS（JS 从来不加这个类）。所以着色器一旦失败（B7、R8），像素 DV **完全没有 CRT 效果**。改成默认显示 #crt，RetroZone 正常运行时再给 #stage 加 `shader` 类。

---

## 8. 性能与资源

> 完整测量和代码示例见 [code_render_findings.md](code_render_findings.md)（R1–R12、A1–A2）。下面的数据来自 headless Chrome 155、`file://`、DPR=2、Apple Silicon。

**帧耗时**（`frame()` 平均 / p95，单位 ms）

| 场景 | 平均 / p95 |
| --- | --- |
| 第三人称 | 1.90 / 3.7 |
| 第三人称 `?light=0` | 0.47 / 0.8 |
| 像素 DV | 1.92 / 3.5 |
| 回看分屏 | 1.75 / 3.3 |

高端机余量很大，但低端集显上大约要乘 4–6。另外 LightRig 每两帧才重建一次，帧耗时在 3ms 和 0.5ms 之间来回跳。

**E2E 实测**（Apple M1、Metal、1280×720）
- 所有场景都稳定在 60fps（房间、DV、扫描、回看、分屏、第二到第四遍、走廊），没有 longtask。只在首帧加载时有一次 493ms。
- 2 分钟内切换 DV 60 次，JS 堆在 5.2–6.0MB 之间，DOM 节点固定 185 个，**没有发现泄漏**。
- **软件渲染（SwiftShader）只有 2.5–5fps**，每帧都有 ReadPixels GPU stall。虚拟机、远程桌面、关掉硬件加速的浏览器上基本不能玩。建议：
  - 检测到帧时间超过 50ms 时，自动关闭 LightRig 和 RetroZone，进入 lite 模式；
  - 需要读回的 2D 画布加 `willReadFrequently:true`。

| # | 级别 | 问题 | 修法 | 量 |
| --- | --- | --- | --- | --- |
| R2 | P1 | RetroZone 覆盖层隐藏时，每帧仍上传 1280×960 纹理（约 4.9MB/帧，≈295MB/s），每帧都调用 `getBoundingClientRect` 并重设 canvas 宽高；backing store 没乘 DPR，画面发糊 | 加 `setVisible()`；隐藏时跳过 render；用 ResizeObserver；乘 DPR | S |
| R3 | P1 | LightRig 占第三人称每帧 CPU 约 75%；按帧数节流，120Hz 屏幕上开销翻倍 | 预先算好每盏灯的衰减图，只遍历光源 bbox，按时间节流到 33ms（离线基准提速 2.2×，输出逐像素一致） | M |
| R4 | P1 | 举着 DV / 回看时，被 92% 黑罩盖住的房间仍然每帧完整重画 | 举起 DV 时画一帧缓存起来；分屏小窗降到 15fps | S |
| R5 | P1 | DV 视频和 poster 是 1344×768（16:9），被直接拉进 4:3，**人物水平方向被压窄约 24%** | 按 cover 方式中心裁切，或转码时直接裁成 4:3 | S |
| R8 | P1 | 没有处理 WebGL 上下文丢失 | lost 时 destroy，回退到 CSS CRT | S |
| R9 | P2 | 热路径里的分配：每帧新建 44 色调色板对象、暗角渐变、items 数组和闭包；`drawNoise` 每帧最多 1600 次 fillRect；回看跟踪带的源矩形没乘 2，复制错了区域（`5152`） | 改成常量 / 预渲染 / 噪点 tile 轮换 | S |
| R10 | P2 | 52 个绘制函数在 `t=0` 时烘焙成静态层，其中 11 个的动画（窗上雨痕、飞蛾、老妇摇晃、烟）**实际上是冻住的** | 需要的拆成每帧小覆盖层，不需要的删掉 | S |
| R11 | P2 | #pixel 按非整数倍缩放（3.23×），像素宽度 3/4 交替；CSS 的 `filter` 让每帧多一次 GPU pass | 加一个可选的整数缩放模式；把这两个系数折算进 shader | S |
| R12 | P2 | iOS Safari 上 `HTMLMediaElement.volume` 是只读的，淡入淡出全部失效，会按 100% 音量播放；MP3 循环有接缝 | 统一改走 WebAudio GainNode；短循环 base64 内嵌后用 `AudioBufferSourceNode.loop` | M |

更正：`ctx.filter=blur()` 只出现在不可达的 `drawCameraScene` 里，**目前没有每帧 filter 的开销**，删掉即可。

**资源（A1）**：运行时包 14.18MB 可以降到约 6.2MB（−57%），都用 ffmpeg 试压过：
- 音乐床 320kbps 改 128kbps（−2.16MB）；
- 雨声、灯丝改单声道低采样率 WAV（不会产生循环接缝，−2.4MB）；
- keyart 缩到 1920px（−1.12MB）；
- 视频去掉无用音轨、裁成 4:3、加 faststart（−0.9MB）；
- poster / 脸图改小尺寸 JPEG data URI。

源码仓库 `assets/` 里有 39.9MB 没被引用，建议挪到 `source_assets/` 或 LFS；打包改成**按引用清单复制**。

---

## 9. 测试与交付

### 9.1 现有测试为什么没发现这些问题

`runTest`（`5892`）在 `silent` 模式下运行，直接改坐标（`state.wx=…`）、直接调用 `completeCameraScan / reviewPick(1) / startChapter(n)`。所以：
- 移动锁死（B1/B2）——测试里根本没走路；
- `updateHide / updateBattery` 断线（B3）——测试里是手动调用的；
- 答案错位（B4）——测试按代码写的答案选，而不是按画面选；
- 重开不彻底（B5）——`freshRun` 只检查了 `reviewCount` 和 `lookFrame`。

### 9.2 要补的真实按键回归（Playwright，`file://`）

| 用例 | 断言 |
| --- | --- |
| T1 第一遍真实按键通关 | 放下 DV 后能移动；能把三处线索全部显影；起仪成功后进入第二遍 |
| T2 第二到第四遍真实按键 | 第四遍倒计时会减少；超时会重来；每轮必须换藏点 |
| T3 第五遍 + 走廊 | 拍完能走到门口；走廊里按 F/R 无效；接完电话回房能移动 |
| T4 回看校验 | 按“画面上的”正确编号能通过；提示文字和画面一致 |
| T5 三结局 | help / film / bad 都通过真实按键到达 |
| T6 重开矩阵 | 第 1/2/3/4/5 遍、走廊、回看、转场中分别重开 → 新局是第一遍，10 秒内状态稳定 |
| T7 自动连发 | `keydown` repeat=true 的空格、E、L 不会重复触发 |
| T8 失焦 | 按住 W 时 blur → 角色停下 |
| T9 着色器 | 进回看 look→gap，RetroZone 每秒 render 次数 ≥50 |
| T10 暂停冻结 | 在第二条拍摄的 3.6 秒内暂停 → 暂停期间不弹出结局 |

可以复用本次审计的脚本（`/tmp/ji_audit/`），放进 `dev/e2e/`。每次打包前跑 `node dev/e2e/run.js`。

### 9.3 交接报告需要更正的说法

| 原说法 | 更正 |
| --- | --- |
| “可完整通关：是” | 否，真实按键在第一遍、第五遍卡死 |
| “46/46 通过” | 函数级测试通过，不代表玩家能走通 |
| “五遍 + 走廊…13–20 分钟（结构估算）” | 最优路径 ≈1.6 分钟，结构上就不足 10 分钟 |
| “躲她 9 秒倒计时” | 没生效 |
| “电量：降到 0 强制关镜头” | 没生效 |
| “23:06 正确答案 1999 / 白胶布的手” | 代码认的是 1998 / 门 |

---

## 10. 执行路线图

| 阶段 | 内容 | 工作量 | 退出标准 |
| --- | --- | --- | --- |
| **S0 · 当天** | `git init` 基线；B1/B2/B3/B4/B6/B8 | 0.5–1 人日 | 真实按键能跑通 help / film / bad 三个结局 |
| **S1 · 1–2 天** | B5（状态工厂 + 游戏时间调度器）、B7（data URI + 着色器兜底）、第 3 节稳定性项、真实按键回归 T1–T10 | 1–1.5 人日 | T1–T10 全绿；重开矩阵全通过 |
| **S2 · 1 周** | 第 5.2 节五遍改造、恐怖节奏 budget、平衡参数集中管理、文案表 | 4–6 人日 | 3 名首次玩家中位数 ≥12 分钟，没人需要看攻略 |
| **S3 · 1 周** | 模块化拆分 + `build.sh`、去掉调试代码、HUD 字号体系、设置/章节持久化、Safari/Edge 验证、资源压缩 | 3–5 人日 | 发布包 ≤10MB；Chrome/Edge/Safari `file://` 都通过 |
| **S4 · 发行前** | 素材替换/授权、商店截图重拍（改动后截图会过期）、内容提示更正、手柄 | 视素材而定 | P2-04 法务通过 |

---

## 附录 A · 关键复现脚本（摘要）

```js
// 第一遍移动锁（真实按键）
await click('#startBtn'); hold('w',1150); hold('d',2300);   // 走到 (8.57,3.51)
press('e'); hold('f',2500); wait(4500);                      // choice=true, ritual.active=true
hold('a',1200);                                              // wx 仍是 8.57 → 锁死

// 自动连发起仪（为了构造状态，把角色放到供桌前）
s.ritual.active=true; s.wx=7.05; s.wy=6.4;
for 4× keyboard.down('Space') 间隔 40ms                      // → {loop:3, ending:'bad'}
```

## 附录 B · 子报告

- 端到端与 UI 实测：[e2e_findings.md](e2e_findings.md)
- 渲染、代码与资源：[code_render_findings.md](code_render_findings.md)
