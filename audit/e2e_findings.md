# 《祭：她在画面里》v2.4 — 真实输入 E2E 审计报告

- 日期：2026-10-20；审计方：QA 子代理（Playwright-core 1.64.1 驱动本机 Chrome，file:// 加载，headless）
- 驱动方式：全部操作都用 `page.keyboard.down/up` 和真实鼠标点击/右键完成；只通过 `window.__jiThird.state` **读取**状态。凡是写入状态的地方都在下文标为 **WORKAROUND / DEBUG**。
- 脚本：`/tmp/ji_audit/`（lib.js、play.js、bad.js、progress.js、edge.js、perf.js、perf2.js、ui.js、probe_restart.js），原始 JSON 结果在 `/tmp/ji_audit/out_*.json`
- 截图：`audit/shots/*.jpg`（52 张，JPEG q70）。注意：运行本次审计的模型不能查看图片，所以 UI 结论来自 DOM 几何量测，截图只作为证据。
- 渲染后端说明：按要求使用 `--use-angle=swiftshader` 时**只有约 5–6 fps**（GPU stall 警告来自 ReadPixels），实时驱动无法稳定执行。所以试玩和性能测试使用 Chrome 默认 headless 后端（ANGLE Metal, Apple M1）；swiftshader 的数字另外列出。
- WebKit：`~/Library/Caches/ms-playwright` 下只有 chromium-1208，没有 webkit 构建，**Safari 未测试**。
- 全部运行中 `pageerror` = 0，console error = 0；只有 swiftshader 下有 4 条 `GPU stall due to ReadPixels` 警告。

---

## (a) 试玩步骤表（真实按键）

结论：**不借助调试写入，第 1 遍和第 5 遍都无法完成（软锁）**。用 `state.choice=false` 绕过后，两个主结局和坏结局都能用真实按键打通。

| # | 步骤 | 结果 | 说明 |
|---|---|---|---|
| 1 | 标题页 → 点击「开始」 | PASS | 字幕「老妇：过来…」，提示「W/A/S/D 走近她」 |
| 2 | WASD 走到老妇 (9.6,3.6) | PASS | 约 4 秒 |
| 3 | E 对话 | PASS | 提示「按住 F / 右键，举起 DV」 |
| 4 | 按住 F（或鼠标右键）举起 DV，拍摄者揭示 | PASS | 角色名变为「主观摄像机」；右键同样可用 |
| 5 | 松开 F → choice → 约 1.5 秒后 uncanny + 仪轨激活 | PASS | |
| 6 | **放下 DV 后用 WASD 移动** | **FAIL（P0 软锁）** | 按 D/S 各 700 ms，位移 = 0.000。`state.choice=true` 时 frame() 不处理移动。提示却写着「E 调整供桌」 |
| 7 | R 回看 18:06 / R 退出 | PASS | |
| 8 | Tab 打开/关闭记录板 | PASS | 打开时 E/Space/R/L 都被吞掉（符合设计） |
| 9 | 在老妇处按 E | PASS（但没有用） | 「老妇：先摆好供桌…」，仍然不能移动 |
| — | **WORKAROUND（调试写入）** `state.choice=false` | — | 之后的第 1 遍都基于此继续 |
| 10 | 香炉/水碗/门框：走过去 + 按住 F 1.45 秒显影 + L 拍照 | PASS | 每张照片消耗 16% 电（100→84→68→52） |
| 11 | E 调整为 乙（香 3 / 水 左 / 线 高） | PASS | 分别按 1、2、2 次 |
| 12 | 拍满三张后的吓人段落 | PASS | 「照片里，站在你身后的，不是老妇。」 |
| 13 | 在供桌前按 Space 起仪 | PASS | 「老妇：……对了。」→ 约 6.0 秒后（吓人段落 + 700 ms 黑场）自动进入第 2 遍 |
| 14 | 第 2 遍：按 F 读取位置 → 走过去 → E，共 3 次 | PASS | 共 11.6 秒；E 找错位置会让她换位置（站定连按 E 同样能通关，见 B-10） |
| 15 | 第 3 遍：三处异常各 F + L | PASS | 共 12.4 秒 |
| 16 | **第 4 遍 9 秒倒计时** | **FAIL（P1）** | HUD 一直显示 `9.0s`，倒计时从不走（`updateHide` 没有调用方） |
| 17 | 第 4 遍：按 F 读取她的视线 → 躲到另一处 → E，共 3 轮 | PASS | 共 7.1 秒；最后一轮显示「第 4 / 3 轮」（B-8） |
| 18 | 第 5 遍：走近 + F + L 拍她 | PASS | 「拍到了。电话响了。」 |
| 19 | **拍照后走到门口** | **FAIL（P0 软锁）** | 位移 0.000（`takeFinalPhoto` 设置了 `choice=true`）；按 E 只会提示「电话在门后」 |
| — | **WORKAROUND（调试写入）** `state.choice=false` | — | |
| 20 | 走到门口按 E → 走廊；按住 W 到尽头；按 E 接电话 → 回到房间 | PASS | 走廊段约 5.8 秒 |
| 21 | Q 让她抬手 → 按住 F 看到错手 → 松开 | PASS | |
| 22 | R 回看 → 按住 D 倒到 23:06 空白 → 出现校验题 | PASS | |
| 23 | **第 1 题：按 2（画面上「2 1999」）** | **FAIL（P0 答案错位）** | 判错；只有按 1（画面上「1 1998」）才算对，字幕却说「1999」 |
| 24 | **第 2 题：按 3（画面上「3 白胶布的手」）/ 按 1（提示里的「1 白胶布的手」）** | **FAIL** | 两个都判错；只有按 2（画面上「门」、提示里「空椅子」）才算对 |
| 25 | Q 微调使重建条对齐 → P 分屏 → R 退出 | PASS | |
| 26 | E 走向她 → 结局「你走过去了。」 | PASS | 游戏内用时 01:37 |
| 27 | 单独一局：按住 F → 结局「你一直在拍她。」 | PASS | 游戏内用时 01:50（同样需要两次 WORKAROUND） |
| 28 | 坏结局：在供桌前按 3 次 Space（间隔 2 秒） | PASS | 用时 00:18；**无需绕过**，因为玩家一开始就站在供桌旁 |
| 29 | 坏结局：按住 Space 约 600 ms（模拟系统按键自动重复） | PASS？/ 设计风险 | 约 0.6 秒内直接进入坏结局，三次失败没有任何缓冲（B-9） |

---

## (b) Bug 列表

### P0

**B-1 第 1 遍软锁：第一次放下 DV 后无法移动**（已用真实按键确认，两局都复现）
- 复现：开始 → 走到老妇 → E → 按住 F 约 1.3 秒 → 松开 → 按 WASD。
- 实际：`state.wx/wy` 不变，`state.choice===true`。玩家只能在原地 E/R/Tab/Space，香炉 (9.65,5.1)、水碗 (6.55,6.3)、门框 (3.7,1.0) 都到不了，摆不出乙。唯一能推进的路线是原地按 3 次 Space 进入坏结局。
- 期望：仪轨阶段可以自由走动。
- 位置：game.js:5552 `if (!state.camera && !state.ending && !state.choice && …)` 的移动门禁；`choice` 在 setCamera(false) 里设置（game.js:3707/3717），之后只有 startChapter 才清掉。
- 修复建议：移动门禁改成 `!(state.choice && !state.ritual.active)`，或在 triggerUncanny/仪轨激活时设置 `state.choice=false`；回归测试要覆盖「仪轨激活后能移动」。内置自测漏掉这个问题，是因为它直接给 `state.wx/wy` 赋值。

**B-2 第 5 遍软锁：拍下她以后无法走到门口**（已用真实按键确认）
- 复现：进入第 5 遍 → 走近她 → F + L → 松开 F → WASD。
- 实际：位移为 0；按 E 只提示「电话在门后」。门在 (2.0,0.6)，到不了，主线卡死。
- 位置：game.js:4803 `takeFinalPhoto` 设置了 `state.choice=true`，再加上 5552 的移动门禁。
- 修复：删掉 4803 这一行（answerPhone 回到房间时在 4527 会自己设置 `choice=true`）。

**B-3 23:06 校验题的答案和画面选项对不上**（已确认）
- 复现：回看 → 按住 D 到空白段 → 按画面上的 2「1999」，判错；按 1「1998」才判对。第 2 题按画面上的 3「白胶布的手」判错，按 2「门」才判对。
- 位置：game.js:3851 `const correct=[1,2]`，按键是 1 起编号（5448–5450 调用 `reviewPick(1..3)`）；画面选项在 5123–5124：Q1「1 1998 / 2 1999 / 3 2003」，Q2「1 空椅子 / 2 门 / 3 白胶布的手」。第 2 题的 DOM 提示（3861）又写成「2 空椅子 / 3 门 / 1 白胶布的手」，和画面、判定三者各不相同。
- 影响：照着画面答题的玩家一定会答错。错误不会锁死，但这个谜题等于失效；要在两题里试满 3 次才能对上，还会触发「跳带」惩罚。交接文档 4.7 也说答案是 1999 / 白胶布的手。
- 修复：`correct=[2,3]`，3861 的提示改为「1 空椅子 / 2 门 / 3 白胶布的手」；runTest 5972 的 `reviewPick(1); reviewPick(2);` 改为 `(2)`、`(3)`。

**B-4 「重新开始」/「回到标题」不会重置章节状态**（已确认，真实点击按钮）
- `reset()`（game.js:5618–5658）没有重置 `chapter / scene / hunt / hide / corr / finalPhoto / phoneDone / oldWomanGone / darkChapter / anomalies / recon*`。实测：
  - 在第 4 遍暂停 → 重新开始：标题流程看上去是新开局（老妇台词出现），但 `chapter=4`，`hide.active=true`，`oldWomanGone=true`。走到老妇处按 E，触发了**躲藏失败**（「她正看着这里。」+ 黑场），新开局就此损坏。截图 `edge_after_restart_from_ch4.jpg`。
  - 在走廊里暂停 → 重新开始：`scene='corridor'` 保留下来，画面仍是走廊，字幕却是第 1 遍台词；按 W 推进的是走廊进度。截图 `edge_after_restart_from_corridor.jpg`。
  - 结局 → 「重新开始」，以及结局 → 「回到标题」→「开始」：`chapter=5, finalPhoto=true, phoneDone=true, corr.answered=true` 都没清掉。继续玩下去：仪轨出现在第 5 遍里，第 5 遍 HUD「最后一遍 · 手」和仪轨 HUD 同时显示，状态混乱。截图 `edge_after_end_restart.jpg`。
- 修复：在 reset() 里补齐上述字段（`chapter=1; scene='room'; hunt=null; hide=null; corr={…}; finalPhoto=false; phoneDone=false; oldWomanGone=false; darkChapter=false; anomalies={…}; reconAligned=false; reconOffset=0.08; reviewQuiz={step:0,locked:false,wrong:0}; reviewFoundGap=false; chapterStartedAt=0; transition=false`），并调用 `updateChapterHUD()`。更稳妥的做法是用一个 `initialState()` 工厂函数整体重建 state。

**B-5 计时器在暂停和重开后仍会触发**（已确认）
- 起仪成功后约 150 ms 内暂停 → 重新开始：新开局第 5.0 秒时黑场，第 5.5 秒跳到第 2 遍（`edge_restart_then_jumped_ch2.jpg`）。
- 起仪成功后马上暂停、一直不恢复：6.5 秒后 `chapter=2`，并在暂停菜单下面显示了「第二遍…」字幕（`edge_paused_but_chapter_changed.jpg`）。
- 位置：起仪后的吓人段落和 startChapter 都靠 `setTimeout(…,700)`；拍照后的 `setTimeout(()=>startChapter(4),1100)` 在 game.js:4765/4789；还有 hideFail 等。这些都没有被 reset/pause 取消，也没有检查 `state.paused`。
- 修复：统一用 `schedule(fn,ms)` 并记录 timer id，reset/returnToTitle 时 clearTimeout；或者给每次运行分配 `runId`，回调执行前先检查 `runId` 和 `!state.paused`。

### P1

**B-6 第 4 遍 9 秒倒计时根本不运行**（已确认）
- HUD 始终显示「第 N/3 轮 · 9.0s」，等 3 秒以上 `hide.remaining` 仍为 9。超时失败的路径永远不会发生，第 4 遍没有任何压力（交接文档 4.5 和 8-P1-5 讨论的「9 秒太紧还是太松」也就无从谈起）。
- 位置：`updateHide(dt)` 定义在 game.js:4706，全文件**没有调用方**。frame() 在 5510 附近只对走廊调用了 `updateCorridor`。
- 修复：在 frame() 中、room 场景且 `!paused && !caseOpen && !review && !transition` 时调用 `updateHide(dt)`。顺带回答任务里的问题：「Tab 打开记录板时计时是否继续」，目前因为计时根本不走，无法观察；修好以后应在 caseOpen/paused 时暂停计时。

**B-7 DV 电量既不耗电也不回充**（已确认）
- 按住 F 5 秒，电量保持 100；电量为 0 时等 5 秒也不回充。
- 位置：`updateBattery(dt)`（game.js:3359）只有 runTest（5912）调用，所以 `forceCameraOff`、「电量见底」都到不了。正常流程下每章电量重置为 100，每章最多 3 张照片共扣 48%，所以真实玩家不会被锁住；但「电量」这个设计实际上没有生效。
- **DEBUG** 测试（手动设成 9% 和 0%）：连按 L → 「电量不够拍。」；0% 时按 F → 「电量不够。等它回一点。」，但电量永远回不来。如果以后有其他途径能把电量耗到 16 以下，就会变成软锁。
- 修复：在 frame() 里调用 `updateBattery(dt)`。

**B-8 第 4 遍 HUD 显示「第 4 / 3 轮」**（已确认）：第 3 轮躲开后，到切章前的约 1 秒里出现。位置是 updateChapterHUD 第 4 遍分支（game.js:3336 附近）的 `round+1`，应改为 `Math.min(round+1,3)`。

**B-9 坏结局几乎没有门槛**（已确认）
- 玩家一开始就站在供桌附近（坏结局那局第一次举 DV 就在供桌前）。之后无法移动（B-1），连按 3 次 Space 就进入坏结局；按住 Space 约 0.6 秒，靠系统按键自动重复就会连续触发 3 次（keydown 没有检查 `e.repeat`）。
- 修复：Space 处理里加 `if (e.repeat) return;`；commitRitual 失败后加约 1.5 秒冷却或二次确认。

**B-10 第 2、4 遍可以无脑连按 E 通关**（已确认）
- 第 2 遍：站在帘子处连按 E，约 7 次按键通关。找错只会让她换位置，没有惩罚，F 取景器变成可有可无。
- 第 4 遍：站在帘子处连按 E，3 次就通关（她只要不朝向这里就算成功；朝向这里才失败）。玩家甚至不用移动。
- 建议：找错时加冷却或扣分；躲藏要求每轮换位置，或在她转身前检查玩家是否已经在藏点。

**B-11 R 在章节黑场期间会打开回看，并把回看带进下一遍**（已确认）
- startChapter 的 700 ms 黑场期间，Esc 被忽略（可以接受），但 R 会打开回看（`review=true`）。apply() 执行后 `chapter=2` 而 `review` 仍为 true，玩家进入第 2 遍时停在回看界面（`edge_review_carried_into_ch2.jpg`）。可以用 R 退出，所以不是锁死。
- 修复：startReview 里加 `if (state.transition) return;`，apply() 里也调用一次 exitReview。

**B-12 走廊里能按 F 和 R**（已确认）
- 走廊中按 F：`state.camera=true`，但 `#camera` 没有 `.on`，即逻辑上举着 DV、画面上看不见。此时 E（接电话）被 interact 的 `state.camera` 拦截，没有反馈。按 W 仍会前进。
- 走廊中按 R：进入第 1 遍的回看画面，提示「A/D 倒带」，W 仍会推进走廊。R 退出后的提示是房间里的文案「E 走向她 / 按住 F 继续拍」。
- 位置：setCamera/startReview 都没有检查 `state.scene`（startReview 约在 3900，setCamera 约在 3700）。修复：两处都加上 `if (state.scene==='corridor') return;`。

**B-13 失焦后按键卡住**（部分确认）
- 没有 `blur`/`visibilitychange` 处理（grep 只找到 keyup 5465）。实测：派发 keydown(A) 再派发 window blur、不发 keyup，角色持续向左走（11.38 → 7.31，1.5 秒）。按下 F 后 blur，摄像机一直举着。Alt-Tab 时系统通常不会把 keyup 发给页面，所以真实玩家会遇到。
- 修复：`window.addEventListener('blur',()=>{keys.left=keys.right=keys.up=keys.down=false; if(state.camera) setCamera(false);})`，最好同时自动暂停。

**B-14 暂停期间松开 F，恢复后摄像机仍然举着**（已确认）
- 按住 F → Esc → 松开 F → Esc 恢复：`camera=true`，必须再按一次 F 才能放下。期间扫描风险计时继续（恢复后马上出现「取景器里多了一个人。」）。keyup 里的 setCamera(false) 在暂停时被忽略。
- 修复：resumeGame 时如果 F 没有按着就 setCamera(false)，或者暂停时直接强制收起 DV。

### P2

- **B-15 Esc 在黑场时被忽略**：这 700 ms 里玩家暂停没有反应（`transition_keys`），可以接受，但需要知道。躲藏失败的黑场期间 Esc 同样无效。
- **B-16 没有小键盘 1/2/3**：只认 `Digit1..3`（5448–5450）。
- **B-17 第 3 遍在非目标处按 E**：只回复「她在取景器里。举起 F，按 L 拍。」（5383），但第 3 遍拍的是异常而不是「她」，文案错误。
- **B-18 第 1 遍提示文案与实际不符**：放下 DV 后提示「F 取景器显影 / R 看旧带 / E 调整供桌 / Tab 记录」，但因为 B-1 无法走到任何目标；回看退出后的提示「E 走向她」在仪轨阶段也有误导性。
- **B-19 swiftshader 下性能极差**：5 fps，每帧都有 ReadPixels GPU stall。疑似来自 `ditherImage` 的 `getImageData`（game.js:3974），也可能是 RetroZone WebGL 读回。在虚拟机、远程桌面或不支持 GPU 的环境里几乎不可玩。建议 2D context 使用 `willReadFrequently:true`，或用 OffscreenCanvas 缓存抖动结果。

---

## (c) 性能（默认 GPU：ANGLE Metal / Apple M1，1280×720，headless）

| 场景 | FPS | 帧时间 p50 / p95 / max (ms) | 每帧 JS 耗时 p50 / p95 / max (ms) | longtask |
|---|---|---|---|---|
| 标题页（首次加载） | 51 | 16.7 / 16.7 / 467 | — | 1 次 493 ms（首帧加载） |
| 房间第 1 遍 | 60 | 16.7 / 16.8 / 16.8 | 0.2 / 2.9 / 6.0 | 0 |
| 首次举 DV（视频层） | 60 | 16.7 / 16.7 / 16.8 | 0.3 / 2.8 / 3.3 | 0 |
| 仪轨扫描取景器 | 60 | 16.7 / 16.8 / 16.8 | 0.4 / 2.8 / 4.5 | 0 |
| 回看（18:06） | 60 | 16.7 / 16.8 / 16.8 | 0.2 / 0.4 / 0.8 | 0 |
| 回看 23:06 空白 + 校验题 | 60 | 16.7 / 16.7 / 16.8 | — | 0 |
| 回看 + 重建分屏 | 60 | 16.7 / 16.8 / 16.8 | 0.4 / 2.9 / 5.2 | 0 |
| 第 2 遍找她取景器 | 60 | 16.7 / 16.8 / 16.8 | — | — |
| 第 3 遍暗房 | 60 | 16.7 / 16.8 / 16.8 | — | — |
| 第 4 遍视线取景器 | 60 | 16.7 / 16.7 / 16.8 | — | — |
| 走廊（按住 W） | 60 | 16.7 / 16.8 / 16.8 | — | — |
| **swiftshader** 房间 / 摄像机 / 回看 | 4.8 / 2.5 / 5.0 | 117 / 283 / 167（p95 最高 1283） | — | — |

- 开局后第一次采样偶尔有一帧 450–650 ms（资源和音频首次加载），之后稳定在 60 fps。
- 内存：2 分钟内每 2 秒切换一次 F，共 60 次。`usedJSHeapSize` 在 5.2–6.0 MB 之间波动（起始 6.0 → 结束 5.46 MB），total 约 8.5 MB 不变；DOM 节点恒定为 185；`<audio>` 元素数为 0（媒体对象没有挂到 DOM 上）。**没有发现泄漏**。之后再采 3 秒仍是 60 fps。

---

## (d) UI / 布局（DOM 几何量测；截图为证）

舞台为 `min(97vw, 97vh·16/9)` 的 16:9 区域，摄像机画布按 4:3 居中。各分辨率下的有效缩放如下（camScale = 摄像机 CSS 宽度 / 640）：1280×720 为 1.455，1920 为 2.18，2560 为 2.91，1024×768 为 1.164，800×600 为 0.909。

1. **HUD 字号是固定像素，不随分辨率缩放**（各分辨率都确认）
   - `#ritual .ritualHint` 8px，`#ritualNote` 9px，`.chapterKicker` 9px，`.chapterObj` 和 `.chapterCount` 10px，HUD 按钮 10px，`#controls` 10px，`#camMeta`「带号」10px，`.startCtrl` 9px，`.tlReconMark` 9px，暂停/结局用时 10px，记录板 10px。
   - 2560×1440 下舞台宽 2483px，但仪轨面板仍只有 226×111 px、提示 8px，相对画面不到 9%，可读性很差（`2560x1440_room.jpg`）。
   - 建议改用 `clamp()` 或以舞台宽度为基准的 rem/`--u` 变量。
2. **画布里的文字在小窗口下偏小**：校验题标题 9px、底部提示 10px、选项 12px；在 800×600（缩放 0.909）下实际约为 8.2 / 9.1 / 10.9 CSS px，都低于 11px。1280×720 时分别约为 13 / 14.5 / 17.5 px，没有问题。
3. **800×600**（`800x600_*.jpg`）
   - 回看界面：`#subtitle` / `#prompt` / `#timeline` 两两重叠（243×22、259×29 px），字幕压在时间线上（`800x600_review.jpg`）。1024×768 下 prompt 和 timeline 也重叠 259×13。
   - 记录板 `.caseInner`：scrollHeight 720 > clientHeight 382，需要滚动才能看全；面板盖住了 HUD 顶栏、仪轨面板和字幕（`800x600_case.jpg`）。
   - 暂停面板 `.pauseInner`：内容 550 > 可视 382，被截断需要滚动，「重新开始」按钮和用时可能在可视区外（`800x600_pause.jpg`）。1024×768 下同样截断（550 > 490）。
   - 标题页：始终可见的 `#hud`（「暂停 · Esc」、DV 按钮等）和 `#controls` 叠在标题内容上（574×23 px）。标题页本来就不该显示游戏 HUD，所有分辨率都有这个问题，只是 800×600 下才和内容重叠。
   - `#controls` 的宽度是固定的 737px（不换行），800 宽时左右只剩约 30px，已贴到舞台边缘。
4. **1280×720**：记录板 `.caseInner` 和 `#ritual`（83×65）、`#prompt`（375×29）重叠，即记录板打开时背后的提示和仪轨面板仍然可见、叠在一起（`1280x720_case.jpg`）。回看时 `#subtitle` 和 `#prompt` 轻微重叠 243×9。
5. 1920×1080 / 2560×1440：没有发现重叠或截断，只有第 1 条说的字号问题。
6. 窗口缩放：运行中依次切换 800×600 → 1920×1080 → 1024×768 → 1280×720，舞台和摄像机都正确按比例缩放，没有出现滚动条（documentElement 的 scroll 尺寸等于视口），游戏状态不受影响。

截图清单（节选）：`1280x720_{title,room,camera,review,case,pause,ending,ch4hud}.jpg`、`1920x1080_{title,review,ending}.jpg`、`2560x1440_{room,review}.jpg`、`1024x768_{room,case,review}.jpg`、`800x600_{title,room,case,review,pause,ending}.jpg`；试玩过程截图 `play_*.jpg`；边界测试截图 `edge_*.jpg`。

---

## (e) 最优路径用时（脚本、真实按键、游戏内 performance.now；是**下限**，真人会明显更慢）

「你走过去了」那一局（以下是有标记的分段，单位秒）：

| 段落 | 用时 | 备注 |
|---|---|---|
| 点击开始 → 走到老妇 → 对话 → 首次举 DV → uncanny 结束 | 约 15.1 | 含约 3 秒的 uncanny 脚本演出 |
| 第 1 遍仪轨：3 处显影 + 拍照 + 调整 + 起仪 | 约 20.7 | 需要 WORKAROUND；含约 2.9 秒等待照片吓人段落 |
| 起仪 → 第 2 遍（吓人段落 + 黑场） | 约 6.0 | 不可跳过 |
| **第 1 章合计**（chapterTimes） | **41.1** | |
| 第 2 遍 找她 ×3 | **11.6** | |
| 第 3 遍 拍异常 ×3 | **12.4** | |
| 第 4 遍 躲 ×3 | **7.1** | 倒计时不走（B-6） |
| 第 5 遍：拍她 → 走到门口（需 WORKAROUND） | 约 12.1 | |
| 走廊：按住 W + 接电话 | 约 5.8 | |
| Q / F 错手 / R 回看 / 23:06 校验（含 3 次答错）/ 对齐 / 分屏 | 约 6.8 | |
| 结局 E | 约 0.6 | |
| **全程（游戏内 runEnd）** | **97.6（01:37）** | 「你一直在拍她」那局为 01:50；坏结局最快 0.6 秒按键（16 秒全程） |

估算：按真人阅读字幕、摸索操作计，大约是脚本用时的 5–10 倍，即 8–16 分钟，略低于交接文档宣称的 13–20 分钟目标。第 2–4 遍每遍只需 7–12 秒，节奏偏短。

---

## (f) 内置自测（`?nointro=1&test=1`）

**TEST PASS**：全部检查项通过（out.every(pass)），`document.title` 为 `TEST PASS`。实时（非 virtual-time）用时：载入后约 7.5 秒游戏时间，墙钟 10.5 秒（Metal 后端）；无 pageerror、无 console error。
注意：自测直接给 `state.wx/wy`、`state.camera` 赋值并直接调用 `commitRitual` 等函数，从不经过 frame() 的移动门禁和 updateHide，所以发现不了 B-1、B-2、B-6、B-7；它还用 `reviewPick(1); reviewPick(2)` 把 B-3 的错误答案「固化」成通过。建议补充基于 KeyboardEvent 的回归测试。注意结果写在 `document.title` 和 `#testResult` 里，headless 下 `body.innerText` 读不到。

## (g) 未覆盖 / 限制

- Safari / WebKit 未测（没有 Playwright webkit 构建）。
- headless 下音频只确认了没有报错，没有做实际听感检查。
- 「blur 导致按键卡住」使用合成事件模拟：Playwright 无法模拟系统层面「keyup 被别的窗口吃掉」。
- 「电量为 0」的场景使用 DEBUG 直接写入电量制造，正常流程到不了。
- UI 评估没有人工看图，全部是 DOM 几何量测。
