# 审计修复报告 — v2.5

> 对 `audit/AUDIT_REPORT.md`（v2.4）P0 问题的修复记录与重新验证。
> 日期：2026-10-20（Asia/Shanghai）
> 基线：v2.4 `7007ce49…c6f5`
> 修复后：v2.5 `4f661cdc…6279`（v2.7 follow-up `cea27fa5…2a2e1` 见 §5.5）

---

## 0. 结论

**P0 B1–B8 已修复；真实按键可以完整通关 help 结局，46/46 自测通过，0 pageerror。**
**但“10 分钟以上”仍然不达标：真实按键最优路径实测 77.7 秒。**
**因此 v2.5 应标记为“可运行 hotfix 基线”，不能按 10 分钟产品做第三方评估。**

| 项目 | v2.4 审计 | v2.5 修复后 |
| --- | --- | --- |
| 真实按键第一遍移动 | 锁死 | 正常，`D` 1.2s 位移约 3.1 |
| 真实按键第五遍移动 | 锁死 | 正常，`A` 1.0s 位移约 2.7 |
| 躲她倒计时 | 未接主循环 | 接入 `frame()`，会减少 |
| DV 电量 | 未接主循环 | 接入 `frame()`，会减少 |
| 23:06 校验 | 答案错位 | 2=1999 / 3=白胶布的手，按画面通过 |
| 重开 | 章节串局 | 章节/场景/计时/延时回调重置 |
| 空格连发 | 一次三连 | repeat 事件被忽略；错误起仪锁 1.6s |
| 脸部画布污染 | 着色器停帧 | 脸部 data URI；shader 上传异常回退 |
| 走廊 F/R | 会进摄像机/回看 | 场景守卫，F/R 无效 |
| 完整通关 | 卡死 | 真实按键 77.7s 到 help 结局 |
| 46/46 | 函数级 | 仍 46/46；真实按键另行验证 |

---

## 1. 修复明细

### B1 / B2 · 移动锁死

- 修改 `frame()` 的移动条件：移除 `!state.choice`，改为 `!state.inputLock`。
- `choice` 只保留“结尾/分支”语义。
- `interact()` 的 help 分支加 `nearWoman()`，避免远距离结局。
- 验证：
  - 第一遍放下 DV 后 `choice=true`，按 `A` 1.2s，`wx` 9.63→6.51。
  - 第五遍 `finalPhoto=true` 后按 `A` 1.0s，`wx` 9.63→6.94。

### B3 · `updateHide` / `updateBattery` 未挂主循环

- 在 `frame()` 房间分支、移动之后调用：
  ```js
  updateBattery(dt);
  updateHide(dt);
  ```
- 修复 HUD “第 4 / 3 轮”：`Math.min(3, round+1)`。
- 验证：`?chapter=4` 举 F 1.2s，电量下降、`hide.remaining` 下降；主循环会继续。

### B4 · 回看校验答案错位

- 新增单一数据源：
  ```js
  const REVIEW_QUIZ = [
    { q:'这盘带是哪一年？', opts:['1998','1999','2003'], ans:1 },
    { q:'23:06 缺了哪一帧？', opts:['空椅子','门','白胶布的手'], ans:2 }
  ];
  ```
- `reviewPick(n)` 统一用 `n-1 === ans`；画面/提示从同一 `opts` 生成。
- 验证：真实按 `2`、`3`，`reviewQuiz.locked=true`；按 `1` 不会通过。

### B5 · 重开 / 定时器竞态

- `state.runId`：每次 `reset()` 自增；`later(fn,ms)` 捕获 runId，旧回调自动作废。
- 全文件 `setTimeout` 改为 `later`（唯一保留的是 `later` 内部的原生 setTimeout；测试 `sleep` 用原生 setTimeout，避免暂停死锁）。
- `reset()` 补齐：
  `chapter/scene/hunt/hide/anomalies/finalPhoto/phoneDone/corr/oldWomanGone/darkChapter/reviewQuiz/recon*/inputLock/run*/chapterTimes/pauseQueued`。
- 暂停时 `later` 挂起，恢复后继续；`pauseGame` 遇到转场排队。
- 验证：
  - 第四遍暂停 → 重新开始：chapter=1, scene=room, hide=null；10 秒后仍稳定。
  - 走廊暂停 → 重新开始：chapter=1, scene=room, corr 重置；W 能移动。
  - 结局 → 重新开始：chapter=1, scene=room, phoneDone=false。
  - 旧 commit 的 5.6 秒转场不会串到新局。

### B6 · 键盘连发

- keydown 顶部：
  ```js
  if (e.repeat && !MOVE_KEYS.includes(e.code)) { e.preventDefault(); return; }
  ```
- `wrongRitual()` 设 `state.inputLock=true`，1.6 秒后释放；期间所有键（Esc 除外）忽略。
- 验证：连续 6 次 `repeat=true` 的 Space 不触发起仪；长按不会三连坏结局。

### B7 · 脸部图 / 着色器

- 新增 `assets/face_data.js`：把 `ji_oldwoman_face_v2_480.png` 内嵌为 data URI；`index.html` 在 `game.js` 前加载。
- `FACE_CLOSEUP_IMG.src=(window.JI_FACE_DATA||...)`。
- `vendor/retrozone-shader.js` 的 `texImage2D` 加 try/catch：上传失败时隐藏 overlay、停止 shader，CSS 游戏继续。
- 验证：
  - `file://` 下 `#camera.toDataURL()` 成功（未 taint）。
  - 进入回看/切段 0 pageerror；shader 不再永久停帧。

### B8 · 场景 / 暂停 / 失焦 / 小键盘

- `setCamera`、`startReview`、`canReview`、`raiseHand`、`takePhoto` 加 `scene==='room'` 守卫；`startReview` 加 `transition` 守卫。
- 走廊里 F/R 无效（已验证 `scene` 仍 corridor、camera/review false）。
- 暂停时强制 `hardCloseCamera()`；暂停中按 Tab 不再劫持，允许菜单键盘导航。
- `blur` / `visibilitychange`：清空 keys、强制关 DV、自动暂停。
- 数字键同时接受 `Digit1..3` 与 `Numpad1..3`。
- `dvBtn` 的 `pointerleave` 改为 `pointercancel` + window `pointerup`，避免鼠标稍微移出就断。
- 时钟/水滴 interval 增加 `state.paused` 判断。

---

## 2. 真实按键完整通关

使用 Playwright（真实 `keydown/keyup`，不做 `choice=false` workaround）跑完整流程：

| 章节 | 用时 |
| --- | --- |
| 第一遍 供桌 | 26.6s |
| 第二遍 找她 | 11.7s |
| 第三遍 拍异常 | 11.1s |
| 第四遍 躲她 | 6.7s |
| 第五遍 + 走廊 + 回看 | 约 21.6s |
| **合计** | **77.7s（runEnd=77,686.9ms）** |

- 结局：help「你走过去了。」
- pageerror：0
- console error/warning：0
- 全流程真实按键能走完；B1/B2 不再是阻断。

**结论：内容量不足，最优路径约 1.3 分钟；目标 10 分钟仍失败。**  
这与审计的判断一致：修完 P0 后必须做第 5 节的玩法扩充，而不是继续称“13–20 分钟”。

---

## 3. 自动化与资源验证

| 项目 | 结果 |
| --- | --- |
| 源码 46 项测试 | 46/46 |
| 发布包 46 项测试 | 46/46 |
| 音频 | 24/24，bad=0 |
| 真实按键完整 run | 77.7s，help 结局，0 pageerror |
| 着色器/脸部 | canvas 未 taint，0 pageerror |
| 发布包 | 13 MB，38 个文件 |
| v2.5 zip SHA-256 | `4f661cdc9d238a0df6a7d95490ea68ace03e7a75e87d4c7615276e3733516279` |
| game.js SHA-256 | `0881921e3501f3465037537cca8c083a9b71cc110c11f2ae860bca83ae70ebe0` |

---

## 4. 仍未修复的审计项

审计第 3–9 节的 P1/P2 大部分仍在：

- 谜题答案仍偏直白，第二/三/四遍内容密度低；需要第 5.2 节改造。
- HUD 字号、字形回退、按钮可访问性、Tab/Space 焦点、`user-scalable=no` 未系统修。
- 调试参数和 `runTest` 仍在发布包内（约 330 行）。
- 单文件 6,207 行、全局状态、20 个不可达函数、空 catch 未清理。
- RetroZone 隐藏时仍上传纹理、LightRig 节流、视频 16:9→4:3 拉伸、资源 14MB 未压缩。
- 无 git、无存档/设置持久化、无移动端/手柄。
- 商业素材授权未完成。
- 未做 Chrome/Edge/Safari 人工与音频试听。

---

## 5. 建议

1. **先不要做第三方 10 分钟评估**；v2.5 只是 P0 修复基线。
2. 按审计 5.2 做内容改造，目标：真人中位数 ≥10–12 分钟。
3. 补 T1–T10 真实按键回归（可复用 `/tmp/ji_audit/` 的脚本，移入 `dev/e2e/`）。
4. HUD/焦点/字号/可访问性单独一轮。
5. 资源压缩/模块化/去调试代码单独一轮。
6. 再找 3 名首次玩家计时与签署。

---

## 5.5 v2.6 follow-up（复核 N1–N3）

复核报告新增的 N1/N2/N3 已处理：

- N1：新增 `endTransition()`；`startChapter.apply` 先显示本章 say/prompt，再统一处理 `pauseQueued`；`hideFail` / `startCorridor` 的黑场结束也走同一函数。
- N2：`later()` 从真实 setTimeout 改为**游戏时间调度**（`state.time + ms/1000`，`tickJobs()` 在 frame 内执行）；暂停时 state.time 不前进，剩余时长保留。
- N3：删除 window 级 pointerup 放 DV；dvBtn 使用 pointer capture，只有 dvBtn pointerup / 右键 pointerup 会放下。
- B-10：第四遍增加 `hide.lastSpot`，同一轮不能躲同一个藏点。
- 文案：第三遍 E 提示、第一遍 Q 提示、第一题选项提示统一。
- 新结果：46/46；pauseTimerShift 恢复后 5.2s 进第二遍（预期 ~4.9s）；N3 `camWhileF=true` 点击 mute 后仍 true；走廊 F/R 仍无效。
- v2.7 包：`cea27fa5…2a2e1`；源码：`70fc46c6…3ea2`；真实按键全流程 **85.5s**。
- v2.8：`prompt('')` 补 `cancelLater(promptTimer)`；包 `fdf9020f…47ea`，源码 `71aaaac3…16a4`。
- 第四遍倒计时从 9s 调到 **12s**（换藏点后仍可完成，`hideFail` 重置也改为 12s）。
- 复核 R1–R4 已修：字幕/提示 job 可取消；音频淡出用原生计时；开局 shader 启动用原生 setTimeout；`tickJobs` 单 job 异常隔离。

## 6. 证据文件

- 审计原报告：`audit/AUDIT_REPORT.md`
- 端到端：`audit/e2e_findings.md`
- 渲染/代码：`audit/code_render_findings.md`
- 本次真实 run：`/tmp/ji_audit/`（临时目录；未纳入交付包）
- v2.8 发布包：`dist/ji-she-in-frame-v2.8.zip`
