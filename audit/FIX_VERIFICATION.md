# v2.5 修复独立复核

> 复核对象：`audit/FIX_REPORT.md` 所述 v2.5（zip `4f661cdc…6279`）  
> **v2.6 follow-up（2026-10-20）**：N1/N2/N3 已修；见 §4.5。  
> **v2.7 follow-up（2026-10-20）**：R1–R4（字幕/音频/着色器/调度异常）已修；新包 `cea27fa5…2a2e1`。见 §4.5 末尾。
> **v2.6 独立复核（10-20 17:35）**：N1/N2/N3 属实，三个结局都已用真实按键验证；**新的游戏时间调度器引入了 2 个 P1 回归（字幕被提前隐藏、CRT 着色器前期不启动）和 2 个 P2**。见 §4.6。
> **v2.7 独立复核（10-21 11:50）**：R1–R4 全部属实；20 个真实按键用例和探针全部通过，**没有发现新的回归**。见 §4.7。  
> **v2.8 follow-up（10-21）**：`prompt('')` 取消旧计时；文档勘误已修；包 `fdf9020f…47ea`。见 §4.8。
> 复核日期：2026-10-20（Asia/Shanghai）
> 方法：
> - 读修改后的代码（`game.js` 6207 行）；
> - 用 Playwright 驱动本机 Chrome，在 `file://` 下用**真实按键**跑 14 个用例，全程**没有**写 `state` 绕过；
> - 跑内置自测。
>
> 复核脚本：`/tmp/ji_verify/v.js`、`n3.js`；结果：`/tmp/ji_verify/out.json`

---

## 0. 结论

**FIX_REPORT 对 B1–B8 的修复说法基本属实，可以复现。** v2.5 现在能用真实按键打通三个结局，0 pageerror。

这次复核**新发现 1 个 P1、2 个 P2**，都是修复本身带进来的副作用，不阻断通关。另外，FIX_REPORT 第 4 节自己列出的未修项、以及“内容量不足 10 分钟”的结论，我同意。

**判定**：作为“可运行的 hotfix 基线”**可以接受**；N1/N2/N3 已在 v2.6 修复（见 §4.5）。它仍然**不适合**按 10 分钟的产品去做第三方评估，下一步应做内容扩充与 T1–T10 回归。

---

## 1. 交付物校验

| 项 | 结果 |
| --- | --- |
| zip SHA-256 | `4f661cdc9d238a0df6a7d95490ea68ace03e7a75e87d4c7615276e3733516279`，和报告一致 ✅ |
| `game.js` SHA-256（源码 = 发布包） | `0881921e…ebe0`，和报告一致 ✅ |
| `index.html` / `style.css` / `retrozone-shader.js` / `face_data.js`：源码和发布包 | 逐字节相同 ✅ |
| 发布包文件数 | 38，和报告一致 ✅ |
| `node --check game.js` | 通过 ✅ |
| 内置自测 `?nointro=1&test=1` | **TEST PASS**，游戏时间 7.7s，0 error ✅ |
| git | 仍然没有仓库 ⚠️ |
| v2.4 基线包 | `dist/` 里**已经没有** `ji-she-in-frame-v2.4(.zip)` ⚠️ 审计基线不能再复现，建议恢复或归档到 `dist/archive/` |

---

## 2. 逐项复核（真实按键）

| 编号 | 报告说法 | 复核用例 | 实测 | 判定 |
| --- | --- | --- | --- | --- |
| B1 | 第一遍放下 DV 后能走 | help 全流程 | 第一遍自由走到香炉、水碗、门框、供桌，正常起仪 | ✅ |
| B2 | 第五遍拍照后能走到门口 | help / corridor | 拍她 → 走到门口 → E 进走廊 | ✅ |
| B3 | 倒计时接进主循环 | pauseQueue | 原地不动 9s 后触发“她到你了”，黑场后重来，`remaining` 重置并继续倒数 | ✅ |
| B3 | 电量接进主循环 | battery | 99.1% → 按住 F 19.5s → 自动关镜头，字幕“电量见底。镜头自己灭了。” → 会回充 | ✅ |
| B3 | “第 4 / 3 轮” | 代码 | 改成了 `Math.min(3, round+1)` | ✅（代码确认） |
| B4 | 校验题按画面通过 | help | 按 `2` → step 1，wrong 0；按 `3` → locked，wrong 0；第二题提示“1 空椅子 2 门 3 白胶布的手”和画面一致 | ✅ |
| B5 | 重开不串局 | restart_ch2 / restart_commit / restart_ch4 / restart_end_title | 四种情况新局都是 `ch1 / room`，8 秒后仍然稳定，没有跳到第二遍；“结局 → 标题 → 开始”后能移动 | ✅ |
| B6 | 长按空格只算一次 | holdSpace | 长按（8 次 repeat）→ `loop=1`；间隔 1.9s 再按两次 → 坏结局 | ✅ |
| B7 | 画布不再被污染、着色器不停帧 | shader | 回看进到 look 段，`#camera.getImageData` 正常（clean）；RetroZone overlay 在，连续两张截图不同（没有冻结） | ✅ |
| B8 | 走廊里 F/R 无效 | corridor | F → `camera=false`；R → `review=false` | ✅ |
| B8 | 失焦自动暂停、不卡键 | blur | 按住 D 时触发 blur → 暂停；恢复后位移 0（键已清空） | ✅ |
| B8 | 暂停时收起 DV | pauseReveal | 按住 F → Esc → `camera=false`；恢复后再举一次 F，揭示流程能正常往下走 | ✅ |
| — | 完整通关时长 | help | **81.5s**（第一遍 24.8s、第二遍 9.8s、第三遍 11.3s、第四遍 9.4s、第五遍 + 走廊 + 回看 ≈26s）。和报告的 77.7s 是同一量级 | ✅ |

---

## 3. 新发现的问题

### N1 · P1 · 只有“章节切换”会处理排队的暂停，其他黑场里的暂停会被吞掉或延后很久才生效

- **复现（真实按键）**：进第四遍 → 原地不动等 9 秒 → “她到你了”黑场时按 Esc。
  - 结果：黑场结束后**没有暂停**（`pauseQueued=true` 一直挂着），倒计时照走。
  - 等到第四遍躲完、进入第五遍时，**突然自己暂停**。而且 `apply()` 里排队暂停之后直接 `return`，第五遍的开场字幕“最后一遍。先拍她。”和操作提示**都不显示**，屏幕上留着第四遍的旧提示“F 看她 / E 躲”。
  - 在走廊转场（500ms）里按 Esc 也一样：`pauseQueued=true` 一直不被处理，这次暂停直接丢了。
  - 失焦同理：在这几段黑场里切走窗口，游戏**不会暂停**，第四遍倒计时会在没人操作时一直跑。
- **根因**：
  - `pauseGame()` 遇到 `transition` 只会置 `pauseQueued=true`（`game.js:5763`）；
  - 只有 `startChapter.apply` 会读它（`4488`）；
  - `hideFail`（`4683/4690`）和 `startCorridor`（`4513`）清掉 `transition` 时都不检查；
  - `4488` 的 `return` 把开场文案也一起跳过了。
- **修法**：收口成一个函数，所有转场结束都调用它，并且先把文案显示出来再暂停：
  ```js
  function endTransition(){
    state.transition=false;
    if (state.pauseQueued){ state.pauseQueued=false; pauseGame(); }
  }
  // startChapter.apply：先 say/prompt，最后调用 endTransition()（删掉 4488 的 return）
  // hideFail 的 later 回调、startCorridor.apply：把 state.transition=false 换成 endTransition()
  ```
- **验收**：在 `hideFail`、走廊、章节这三种黑场里分别按 Esc 或触发 blur，黑场一结束**立刻**暂停；恢复以后能看到当前章节的开场文案。

### N2 · P2 · 暂停会把剧情计时“吃掉”一段

- **复现**：第一遍起仪成功约 1s 后暂停 6s，再恢复。按原本的时序，离进入第二遍应该还剩约 5.3s（2.6s + 3.0s + 0.7s 黑场），实测恢复后 **3.76s** 就进了第二遍，惊吓段被砍掉约 1.5s。
- **根因**：`later()` 在暂停期间只是每 100ms 轮询一次，到期就在恢复后立刻执行，**不会保留剩余时长**（`game.js:259-267`）。`scareUntil / photoFlashUntil / closeupUntil` 这些基于 `performance.now()` 的截止时间也不扣除暂停时长。
- **修法**：改成按游戏时间调度（审计报告 B5 里的方案 2）：
  ```js
  function later(fn,ms){ jobs.push({at:state.time+ms/1000, fn, run:state.runId}); }
  // 在 frame() 中、state.time+=dt 之后调用 tickJobs()；暂停时 state.time 不前进，剩余时长自然保住
  ```
  把视觉截止时间也改成基于 `state.time`。

### N3 · P2 · 按住 F 时点任何地方都会放下 DV

- **复现**：第二遍按住 F 举起 DV → 用鼠标点 HUD 上的“声音”按钮 → `camera=false`。
- **根因**：新加的 `window.addEventListener('pointerup', …)`（`game.js:5516`）只要场景是房间就放下 DV，没有区分是不是 DV 按钮或右键发起的举起。
- **修法**：用 `state.camSource='key'|'pointer'|'rmb'` 记录是谁举起的。`pointerup` 只在 `camSource!=='key'` 时放下；或者对 `dvBtn` 用 `setPointerCapture`，然后删掉这个 window 级监听。

---

## 4. 没有修，但和本次修复直接相关的提醒

| 项 | 现状 | 建议 |
| --- | --- | --- |
| 第二、四遍连按 E 就能过（审计 B-10 / 5.1） | 仍然可以：第四遍她没看着你所在的藏点，就能站在原地连躲 | 第四遍加“每轮必须换藏点”，大约 3 行代码，建议和 N1 一起修 |
| 第三遍按 E 的文案（审计 B-17） | 仍然是“她在取景器里。举起 F，按 L 拍。”（`5403`） | 改成“房间被改过。举起 F，对准不对的地方按 L。” |
| 第一遍的显影 / 拍照仍然是可选的 | help 全流程**一次都没显影、没拍照**就完成了第一遍（只走到实物前按 E 调整） | 属于审计 5.2 的玩法改造范围 |
| 第一题的提示条 | 显示“1 / 2 / 3 校验带子”，不列选项（第二题列了） | 统一从 `REVIEW_QUIZ[step].opts` 生成 |
| RetroZone overlay 分辨率 | 931×698，没乘 DPR（审计 R2） | 下一轮性能项 |

---

## 4.5 v2.6 follow-up（N1–N3 已修）

- **N1**：新增 `endTransition()`，`startChapter` / `hideFail` / `startCorridor` 黑场结束统一处理 `pauseQueued`；开场 say/prompt 先显示再暂停。
  - 复测：hideFail 黑场 Esc → 黑场结束 `paused=true`；走廊 500ms 转场 Esc → `scene=room` 且 `paused=true`。
- **N2**：`later()` 改为游戏时间调度 + `tickJobs()`；暂停不再吃掉剧情计时。
  - 复测：`pauseTimerShift` 恢复后 **5.2s** 进第二遍（预期 ~4.9s）。
- **N3**：删除 window 级 pointerup 放 DV；dvBtn 使用 pointer capture。
  - 复测：`camWhileF=true` → 点击 `#muteBtn` → `camera` 仍 `true`。
- **B-10**：第四遍增加 `lastSpot`，同一轮不能重复躲同一藏点。
- 文案：第三遍 E、第一遍 Q、第一题选项提示已统一。
- **v2.7**：46/46；音频 24/24；真实按键 help 全流程 **85.5s**，0 pageerror；zip `cea27fa5…2a2e1`。
- **R1**：`later()` 返回 job id，`cancelLater()` 真正移除字幕/prompt job；连续 say/prompt 不再被旧计时提前隐藏。
- **R2**：音频 `armCueFade` 改回原生 `setTimeout/clearTimeout`，不再受游戏时间与暂停影响。
- **R3**：`initVideoLayer` 的 `startRetroDisplay` 改回原生 setTimeout，开局 camera 前不再因 runId 变化被丢弃。
- **R4**：`tickJobs()` 对每个 job 加 try/catch，异常不再中断整个调度器。
- 仍未解决：10 分钟内容量、T1–T10 全矩阵、P1/P2。film/bad 已在 §4.6/§4.7 用真实按键验证通过。

## 4.6 v2.6 独立复核（17:35）

> 对象：`dist/ji-she-in-frame-v2.6.zip` `8c461cf5…77d7`；`game.js` `0f1de2ff…f401`（6222 行，源码和发布包一致，38 个文件，`node --check` 通过）。
> （注：这一行曾被改成 v2.7 的哈希 `cea27fa5…` / `70fc46c6…`。本节复核的对象是 v2.6，已改回原值；v2.7 的复核见 §4.7。）
> 方法：同样用真实按键，跑 14 个用例 + 3 个新探针。脚本 `/tmp/ji_verify/{v.js,n3.js,cue.js,crt.js,prog26.js}`。

### 4.6.1 v2.6 的说法逐条复核

| 项 | 实测 | 判定 |
| --- | --- | --- |
| N1：在 hideFail 黑场里按 Esc | 黑场一结束就 `paused=true`，暂停菜单出现，倒计时停在 9.0 | ✅ |
| N1：在 hideFail 黑场里触发 blur | 1.5 秒后 `paused=true`，等 2 秒 `remaining` 仍是 9.0 | ✅ |
| N1：在走廊转场里按 Esc | 转场结束 `scene=corridor, paused=true`，`pauseQueued` 已清掉 | ✅ |
| N2：起仪后暂停 6 秒再恢复 | 恢复后 **5.30s** 进第二遍（v2.5 是 3.76s；按设计应约 5.3s） | ✅ |
| N3：按住 F 时点击 HUD“声音” | `camera` 保持 true | ✅ |
| 第四遍不能重复躲同一处 | 代码有 `lastSpot` 判断，按规则躲能通过；而且三处藏点里总有一处可躲，不会卡死 | ✅ |
| 第一题提示列出选项 | “1 1998　2 1999　3 2003　/　A / D 倒带” | ✅ |
| help 结局（真实按键） | 81.6s，ending=help，0 pageerror | ✅ |
| **film 结局（真实按键，首次验证）** | 结局页出现“你一直在拍她。”，用时 01:27 | ✅ |
| **bad 结局（真实按键）** | 长按空格只算一次；隔开按三次后进坏结局，结局页可见 | ✅ |
| 重开（刚起仪 / 第四遍 / 结局→标题→开始） | 都回到 `ch1 / room`，8 秒内稳定，能移动 | ✅ |
| 电量、着色器不污染、走廊 F/R | 和 v2.5 一样，都通过 | ✅ |

### 4.6.2 v2.6 新引入的回归

新的 `later()`（`game.js:261-271`）**没有返回值**。但原来依赖 `setTimeout` 句柄的 3 处调用没有跟着改，`clearTimeout(undefined)` 什么也取消不了。另外，`reset()` 会让开局之前排进去的任务全部失效。

#### R-1 · P1 · 字幕和提示会被上一条的隐藏任务提前关掉

- **证据**：开局后的字幕“老妇：过来…”设了 3.8 秒的隐藏任务。4.3 秒时按 E，新字幕“老妇：手给我看看。”**只显示了 0.43 秒**就被旧任务隐藏了（应显示 3.2 秒）。
- **影响**：凡是 3–4 秒内连着出现两条字幕或提示，第二条都会被提前关掉。第二到第四遍举 F 读位置、拍照、躲藏都是这种节奏，**关键信息会闪一下就没了**。
- **位置**：`game.js:3267-3268`（`say`）、`3280-3281`（`prompt`），以及 `3953 / 5346 / 5376` 的 `clearTimeout(subtitleTimer)`。

#### R-2 · P2 · 同一个音效重播时会被上一次的淡出任务截断

- **证据**（拦截了 `HTMLMediaElement.play/pause`）：第一遍起仪后，老妇呼吸声（6 秒）在 22.51s 播放，25.12s 再播一次，**28.52s 就被暂停了**，第二次只播了 3.4 秒（应约 6 秒）。正好是“她刚才，站在你后面。”这一拍被截断。
- **位置**：`armCueFade`，`game.js:441-446`；`playMedia` 和 `stopCues` 里的 `clearTimeout(el._endTimer)`（`460 / 554`）。

#### R-3 · P1 · CRT 着色器到第一次回看之前都不会启动

- **证据**：
  - 无论有没有视频，标题页 7 秒、开局 7 秒、第一次举 DV、第一遍显影时，`#retrozone-overlay` 都**不存在**；第一次按 R 回看后才出现。
  - 而 `#crt` 这个 CSS 兜底层本来就是 `display:none`（审计 H7）。所以在玩家第一次回看之前，像素 DV 画面**完全没有 CRT 效果**。help 最优路径要到第五遍才回看，等于前四遍都没有。
- **根因**：`initVideoLayer()` 在页面加载时用 `later(startRetroDisplay,0)` 和 6 秒兜底 `later(…,6000)`（`game.js:101/123/147/150`）去启动着色器。但标题页 `state.started=false`，`tickJobs` 不运行；`startGame→reset()` 又让 `runId` 自增，这些任务被**直接丢弃**。

#### R-4 · P2 · 任务回调里抛异常会让整个游戏卡死

- `tickJobs()` 在 `frame()` 里**同步**执行回调，没有 try/catch，而 `requestAnimationFrame(frame)` 在函数末尾。以前用 `setTimeout` 时，一个回调出错只影响它自己；现在一个回调出错，**整个渲染循环就停了**。属于代码层面的风险，目前没有实际触发。

#### 附带说明（不算回归）

`frame()` 的 `dt` 上限是 0.05。所以帧率低于 20fps 时，游戏时间会比真实时间慢。现在剧情计时、字幕时长也跟着变慢：软件渲染 2.5–5fps 时，一条 3.6 秒的字幕会显示 14–29 秒真实时间。可以接受，但在低端机上整体节奏会像慢动作。建议配合审计第 8 节的 lite 模式一起处理。

### 4.6.3 修法（约 30 分钟）

```js
// 1) later 返回句柄，并能取消
let jobSeq=0;
function later(fn,ms){ const id=++jobSeq; scheduledJobs.push({id,at:state.time+ms/1000,fn,run:state.runId}); return id; }
function cancelLater(id){ if(!id) return; const i=scheduledJobs.findIndex(j=>j.id===id); if(i>=0) scheduledJobs.splice(i,1); }
// say/prompt 以及 3953/5346/5376：clearTimeout(subtitleTimer) → cancelLater(subtitleTimer)

// 2) 音频淡出按真实时间算（媒体播放本来就是真实时间），恢复成原生计时
el._endTimer=setTimeout(()=>{ … },delay);   // armCueFade；playMedia/stopCues 保留 clearTimeout

// 3) 着色器启动和游戏流程无关，不走 later
startRetroDisplay();                                   // 101/123/150
setTimeout(()=>{ if(!stage.classList.contains('videoActive')) startRetroDisplay(); },6000); // 147

// 4) tickJobs 隔离异常
try{ j.fn(); }catch(e){ console.error('[later]',e); }
```

**验收**：
- 字幕探针：第二条字幕显示约 3.2 秒；
- 呼吸声探针：第二次播放持续约 6 秒；
- 开局 7 秒内 `#retrozone-overlay` 已存在；
- 在一个 job 里人为 throw 之后，游戏继续运行。

### 4.6.4 判定

v2.6 对 N1/N2/N3 的修复**属实**，三个结局都能用真实按键到达。但改成游戏时间调度时引入了 R-1 和 R-3 两个 P1 回归，都是**体验类**问题（字幕被截、前期没有 CRT），不影响通关。建议**修完 4.6.3 再进入内容扩充**，并把字幕和着色器这两个探针加入回归用例。

## 4.7 v2.7 独立复核（2026-10-21 11:50）

> 对象：`dist/ji-she-in-frame-v2.7.zip` `cea27fa58d07…a52ba2e1`（和 `.sha256` 文件一致）；`game.js` `70fc46c6…3ea2`，6234 行。
> - 源码和发布包的 `game.js / index.html / style.css / retrozone-shader.js / face_data.js` 逐字节相同；共 38 个文件；`node --check` 通过。
> - 方法和 §4.6 一样，全部用真实按键；新增 `r4.js`，在定时任务里人为注入异常。

### 4.7.1 R1–R4 复核

| 项 | v2.6 | v2.7 实测 | 判定 |
| --- | --- | --- | --- |
| R-1 连续两条字幕 | 第二条只显示 0.43s | 第二条显示 **3.22s**（应为 3.2s） | ✅ |
| R-2 同一音效重播 | 第二次只播 3.4s | 第二次完整播 **6.0s**；开局两条循环音各约 6s 正常淡出 | ✅ |
| R-3 CRT 着色器启动 | 首次回看前 overlay 不存在 | 标题页 7s 时 overlay **已创建**（摄像机关着时隐藏）；`?novideo=1` 下第一次举 DV 就显示；有视频时第一次举 DV 播实拍视频（按设计不叠着色器），显影和回看时显示 | ✅ |
| R-4 定时任务抛异常 | 整个循环停止 | 注入的异常被记成 `console.error("scheduled job failed")`，游戏时间继续走，D 键能移动，0 pageerror | ✅ |

### 4.7.2 全量回归（v2.7）

| 用例 | 结果 |
| --- | --- |
| help 结局 | ✅ 84.3s（24.5 / 13.3 / 11.0 / 9.6 / 回看段），两题按画面通过，0 pageerror |
| film 结局 | ✅ 01:22 |
| bad 结局 / 长按空格 | ✅ 长按只算一次；隔开按三次进坏结局 |
| 重开：刚起仪 / 第四遍 / 结局→标题→开始 | ✅ 都回到 ch1/room，8 秒内稳定，能移动 |
| N1：hideFail 黑场 Esc / blur、走廊转场 Esc | ✅ 黑场一结束就暂停，倒计时不走 |
| N2：暂停不吃剧情计时 | ✅ 恢复后 5.30s 进第二遍 |
| N3：按住 F 时点击 HUD | ✅ DV 不会被放下 |
| 电量、失焦、暂停收 DV、走廊 F/R、脸部画布不污染 | ✅ |
| 内置自测 | ✅ TEST PASS |

### 4.7.3 小问题与文档勘误（不阻断）

- **第四遍倒计时从 9s 改成了 12s**（`game.js:4494/4710/4743`）。README 和 EVALUATION_HANDOVER 已经写的是 12s，但 FIX_REPORT 的修复记录里没提这次调参。建议补一行。
- `prompt('')` 隐藏提示时没有 `cancelLater(promptTimer)`。目前无害（旧任务只会再隐藏一次已经隐藏的元素），但建议顺手补上，保持对称。
- FIX_REPORT 有三处勘误：
  - 第 6 行把 `cea27fa5…` 标成了“v2.6 follow-up”，实际是 v2.7；
  - §6 仍然写着证据包是 `dist/ji-she-in-frame-v2.5.zip`，这个文件已经不在了；
  - 本文 §4.5 第 133 行写着“film/bad 真实按键”仍未解决，实际已经在 §4.6 和 §4.7 验证通过。
- 本文 §4.6 的复核对象行曾被改成 v2.7 的哈希，现已改回 v2.6 的原值。**独立复核的记录请不要覆盖**，新结论追加成新的小节。
- **基线归档**：`dev/archive/` 里只有一份 3582 行的早期 `game.js.orig` 和一个补丁 `.rej`，**不是 v2.4 基线**（v2.4 是 6153 行）。v2.4 / v2.5 / v2.6 的包都已经从 `dist/` 删掉，每次只保留最新版。仍然没有 git。

### 4.7.4 判定

**v2.7 可以作为稳定的技术基线**。审计 P0（B1–B8）、复核发现的 N1–N3 和 R1–R4 都已关闭，三个结局都能用真实按键打通，没有发现新的回归。剩下的工作不再是“修 bug”，而是：

1. 工程卫生：`git init`，把每个版本的包归档，把回归脚本收进仓库；
2. 内容扩充，最优路径目前约 84s，离 10 分钟还很远；
3. 审计里的 P1/P2：UI 可访问性、性能、资源体积、调试代码。

## 4.8 v2.8 follow-up（文档/小问题）

- `prompt('')` 现在调用 `cancelLater(promptTimer)`，旧提示任务不会残留。
- `FIX_REPORT` 已修正：v2.7 哈希标注、§6 证据包、12s 调参说明。
- §4.5 的“film/bad 未解决”已改为“已在 §4.6/§4.7 验证通过”。
- v2.8 包 `fdf9020f…47ea`；源码 `71aaaac3…16a4`；46/46，音频 24/24。
- 仍未解决：内容扩充到 10 分钟、T1–T10 回归、P1/P2、git/归档。

## 5. 建议的下一步

1. ~~立刻：修 N1~~ **v2.6 已修 N1/N2/N3 和第四遍强制换藏点；v2.7 已修 R1–R4**；仍建议 `git init`，并把 `dist/` 改成按版本归档，不要覆盖旧版本。
2. 把 `/tmp/ji_verify/v.js` 和 `/tmp/ji_audit/` 的用例搬进 `dev/e2e/`，作为每次打包前必跑的真实按键回归（现在两个目录都在 `/tmp`，重启就会丢）。
3. 然后按 AUDIT_REPORT 第 5.2 节做内容扩充；N2/N3 已在 v2.6 修。

---

## 附：用例原始结果（摘要）

```text
help              ending=help runEnd=81.5s quiz: 2→step1, 3→locked, wrong=0, pageerrors=0
holdSpace         hold → loop=1 ; spaced ×2 → loop=3 ending=bad
restart_ch2       after: ch1/room ; +8s ch1/room, transition=false
restart_commit    after: ch1/room ; +8s ch1/room（没有跳到第二遍）
restart_ch4       after: ch1/room ; +8s hide=null
restart_end_title ch1/room ending=null ; +6s stable ; D 600ms → wx 4.06
battery           99.1 → hold 19.5s → 1.7 cam=false "电量见底" → +3s 5.9
blur              paused=true ; moved after resume = 0
corridor          F→cam=false ; R→review=false ; Esc in fade → pauseQueued=true, paused=false（N1）
pauseQueue        Esc in hideFail fade → not paused ; at ch5 start → paused=true, ch5 intro missing（N1）
pauseReveal       F + Esc → cam=false ; 再次 F → uncanny + ritual 正常
pauseTimerShift   resume → ch2 用了 3758ms（应约 5300ms）（N2）
shader            look 段 getImageData clean ; 截图在变化
n3                hold F + click #muteBtn → camera=false（N3）
selftest          TEST PASS 46/46, 7.7s
```
