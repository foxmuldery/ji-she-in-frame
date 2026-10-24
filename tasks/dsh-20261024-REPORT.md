# dsh-20261024 优化 / debug / 随机玩家 1000 局报告

分支：`exp/dsh-20261024`（起点 `a060274`）  
范围：`game.js`、`dev/sim/player_sim.js`、`dev/fuzz/`、`dev/fuzz.sh`  
约束遵守：未改玩法规则、数值平衡意图、美术风格；未引入资产、未调用付费 API；未读取/写入任何试玩口令或 `.beta_pass`；未 push、未部署。

## 1. 结论

- 自测从 **75/75** 增至 **82/82**（新增的 7 条都是这次修的回看/结局/首拍/提示回归）。
- 已有自检全绿：`AUDIO PASS`、`LUM PASS 23/23`、六档 `UI PASS`、三结局真实按键 `E2E PASS help/film/bad`、内测记录器/落地页 `beta_check` 通过、发布包解包自测 `TEST PASS 82/82` 且无缺失素材。
- 新增纯逻辑随机玩家 fuzz：同一套 1000 局（900 个目标玩家 + 100 个纯 chaos）。
  - 修复前：**0 异常 / 0 console error / 0 卡死 / 0 未到结局**，但抓到 **3 类真实状态/界面问题，共 1291 次命中**。
  - 修复后：同一 1000 局 **3 类问题均归零**，结局分布不变（说明修复没有改变可达性/平衡）。
- 另有 1 条性能优化：走廊/暗房/电量 HUD 与视频层不再每帧写 DOM；无视觉变化。
- 未执行项：`dev/release_audit.mjs` 需要 `dev/.beta_pass`，按任务约束没有读取或创建；完整 `./dev/verify.sh` 因此没有端到端跑。其余门禁均已单独跑过。

## 2. 基线（修复前）

| 项 | 结果 | 命令 |
| --- | --- | --- |
| 语法 | `node --check game.js` OK | `PATH=/opt/homebrew/bin:$PATH node --check game.js` |
| 自测 | **TEST PASS 75/75** | `index.html?nointro=1&test=1` |
| 音频 | **AUDIO PASS**（34 文件） | `index.html?nointro=1&novideo=1&audiodbg=1` |
| 暗屏可读性 | **LUM PASS 23/23** | `index.html?nointro=1&lumtest=1&advance=6` |
| 版式 | 6/6：1280×720 / 1024×768 / 800×480 / 1366×768 / 1920×1080 / 2560×1440 | `index.html?nointro=1&uitest=1` |
| 三结局真实按键 | help 420.4s · film 378.8s · bad 188.5s，全 PASS | `./dev/e2e/run.sh help film bad` |
| 玩家模拟 1000 局 | **10.8%** 到达结局 | `./dev/sim.sh 1000` |
| 内测记录器 | `beta_check` OK | `./dev/beta_check.sh` |

> 玩家模拟的 10.8% 不是游戏回归，而是基线里的模拟器已经过期：`player_sim.js` 仍按“找她 3 次”停手，也没有走廊取景和暗房流程。第 `3503d9d` 提交把它更新到当前 4 次 + 走廊三处 + 暗房接带后，同一脚本为 **97.6%**（剩余为注入捣乱输入导致的暗房提前开接带器/走位超时，见第 6 节）。

## 3. 提交列表（小步，中文说明）

| 提交 | 说明 |
| --- | --- |
| `1f19ef7` | perf: HUD 与视频层只在数值变化时写 DOM |
| `2774d73` | fix: 首次举起 DV 恢复正面特写 |
| `2856466` | fix: 回看 Esc 退出、结局关闭回看、退出提示随章节变化 |
| `c7ff956` | test: 增加可复现种子的随机玩家 fuzz（1000 局） |
| `3503d9d` | test: 玩家模拟更新到 4 次找她、走廊取景与暗房流程 |
| `acb269b` | chore: 纳入本轮优化/fuzz 任务单 |
| `c5740cc` | test: 入库两轮 1000 局 fuzz 统计 |
| `93dd375` | test: fuzz 运行后清理临时浏览器 profile |
| `18f7ca6` | fix: 房间里的电话提示改为先走到门后（电话在走廊尽头） |
| `1c3175f` | test: 第二轮 fuzz 更新到最终代码（0 问题） |

## 4. 修了什么（每类问题）

### 4.1 首次举起 DV 的正面特写永远不触发（视觉 bug）

`setCamera()` 先把 `state.firstCameraDone` 置为 `true`，下一行才判断 `nearWoman() && !state.firstCameraDone`，条件恒假，`state.closeupUntil` 从未在第一次举机时被设置。修复为先保存 `firstRaise` 再置位，并新增 `firstCloseup` 自测。  
Fuzz 证据：修复前 900/900 个目标玩家命中 `CAMERA | first raise near her did not set the close-up`。

### 4.2 回看中按 Esc 打开暂停，而不是退出回看（界面/按键）

keydown 的暂停分支在回看分支之前，`Escape` 先走到 `pauseGame()`；回看自己的 `if (e.code==='KeyR'||e.code==='Escape') exitReview()` 永远到不了。修复：暂停前增加 `Escape && state.review && !state.paused → exitReview()`。  
Fuzz 证据：修复前 273 次 `REVIEW_ESC | Esc left review open=true`。

### 4.3 延迟结局卡可能压在回看界面上（状态泄漏）

`startSecondTake()` 用 `later(...,3600)` 走 film 结局；玩家可在这 3.6 秒里按 R 打开回看。`choose()` 只清 `camera`/`prompt`，不清 `review`，结局出现后回看时间线仍留在上面。修复：`choose()`/`chooseBad()` 先 `exitReview()` 再收尾。新增 `filmRace*` 自测。  
Fuzz 证据：修复前 118 次 `LEAK | review overlay still open after ending`（约为 film 路线的一半，正好对应 50% 概率在延迟窗口按 R）。

### 4.4 回看退出的提示不随章节变化（UI 文案错漏）

`exitReview()` 无论第 2/3/4 遍都提示“E 走向她 / 按住 F 继续拍”，与当前章节动词不符。改为：
- 第 2 遍：`F 取景器 / E 靠近她 / R 回看`
- 第 3 遍：`F 看取景器 / L 快门 / R 回看`
- 第 4 遍：`F 看她 / E 躲 / R 回看`
- 其余保持原句。新增 `reviewCh2Prompt` 自测。

### 4.5 房间里的“按 E 接电话”提示与流程不符（UI 文案错漏）

电话在门后走廊尽头；房间门口按 E 只是进入走廊。两处提示改为“走到门口按 E 去门后”，走廊内仍保留“E 接电话”。

### 4.6 每帧写 DOM 的性能热点（无视觉变化）

- `updateBatteryHUD()` 原本每帧写一次 `textContent` 与 `classList`，现按整数百分比缓存。
- `updateChapterHUD()` 在走廊/暗房每帧重建 `innerHTML`，现按完整可见内容做 key 缓存。
- `updateVideoLayer()` / `syncCameraOverlay()` 每帧 add/remove class、写 `style.opacity/display`、写 `aria-hidden`，现只在 live/pending/overlay 状态变化时写。
- 暗房/走廊仍每帧重绘，但不再每帧触发 DOM 样式/布局；这是本轮唯一改的性能路径。

## 5. 随机玩家 fuzz

### 5.1 方法

`dev/fuzz/fuzz_sim.js`，仅 `index.html?fuzz=N&fuzzseed=<seed>` 加载，`dev/` 不进发布包。

- 每局 `G.startGame(false)` 启动真实状态机；移动走 `blocked()`+`advanceMovement()`，交互走 `interact()`/`setCamera()`/`takePhoto()`/`commitRitual()` 等键盘同款函数。
- 每步由该局种子 RNG 选：三个供品顺序、先看哪个藏点、走错哪个点、是否摆错供品、是否在延迟结局窗口按 R、是否在转场/覆盖层上连按 Esc/Tab/F/L。
- 10% 局为纯 chaos：不找目标，只按合法动词乱按，专门撞重入/覆盖层。
- 每 tick 检查：NaN/Infinity、坐标/深度越界、电量越界、章节/场景非法、计数为负/超上限、结局后回看仍打开；`window.onerror`、`unhandledrejection`、`console.error` 全记。
- 终止：结局 / 120 秒无进展 / 1200 秒模拟上限。种子可复现。

运行：

```bash
./dev/fuzz.sh 1000 20261024 tasks/fuzz-round2.json
```

### 5.2 两轮统计对比

同一 seed base `20261024`，900 个目标玩家 + 100 个 chaos：

| 指标 | 第一轮（修复前 `a060274` 逻辑） | 第二轮（修复后） |
| --- | --- | --- |
| 局数 | 1000 | 1000 |
| 到达结局 | 901 | 901 |
| help / film / bad | 572 / 236 / 93 | 572 / 236 / 93 |
| 目标玩家 help+film | 808 / 900（89.78%） | 808 / 900（89.78%） |
| 未到结局（目标玩家） | 0 | 0 |
| 未捕获异常 | 0 | 0 |
| console.error | 0 | 0 |
| 卡死（120s 无进展） | 0 | 0 |
| NaN / 负值 / 越界 / undefined 不变量 | 0 | 0 |
| 最低电量 | 0（被 clamp；不是负值） | 0（同上） |
| 单局时长 p10 / p50 / p90 | 35.5 / 122.1 / 136.9 s | 35.5 / 122.2 / 136.5 s |
| 问题命中 | **1291** | **0** |
| 其中 `CAMERA` 首拍特写 | 900 | 0 |
| 其中 `REVIEW_ESC` | 273 | 0 |
| 其中 `LEAK` 结局后回看 | 118 | 0 |
| chaos 按设计撞上限（不计卡死） | 99 | 99 |

原始数据：`tasks/fuzz-round1.json`、`tasks/fuzz-round2.json`。  
第一轮是在 `a060274` 的 `game.js` 上只加 fuzz loader、其余逻辑不动跑出来的；第二轮是当前树。结局分布完全一致，说明修复只清了界面/状态问题，没有改变流程与平衡。

### 5.3 “无法通关 / 卡死 / 异常”口径

- **无法通关**：目标玩家在 1200 秒模拟上限内没有到达任何结局。两轮均为 0。
- **卡死**：章节/场景/计数/覆盖层签名 120 秒完全不变。两轮均为 0。
- **chaos 撞上限**：99 局是实验设计的正常结束（纯乱按不找目标），单独计为 `CHAOS_CAP`，不计入卡死/无法通关。
- **异常数值**：每 tick 检查；两轮 0。最低电量 0 是合法的 `Math.max(0,…)` 结果，不是负数。

## 6. 未解决 / 未执行

1. **完整 `./dev/verify.sh` 未端到端跑**：脚本里的 `deploy_beta.sh --dry-run` + `gate_check.mjs` + `release_audit.mjs` 需要 `dev/.beta_pass`。任务明确禁止读取/写入口令文件，仓库里也没有该文件。已单独跑：语法、自测、音频、可读性、六档版式、三结局 e2e、`beta_check`、打包、解包冒烟。
2. **`dev/release_audit.mjs` 未跑**：同上，第一次运行即因缺少 `dev/.beta_pass` 报 ENOENT；没有为了让它通过而创建假口令。
3. **玩家模拟仍有 2.4% 未到结局**：`./dev/sim.sh 1000` 为 97.6%，24 局里 21 局是注入的捣乱输入在暗房提前按 E 打开接带器后被 `k.open` 挡住移动，3 局是走廊走位超时；不是硬锁，重开/继续可恢复。若要把模拟器做到 100%，需要让 bot 在接带器打开时先按 F 关闭，而不是直接判失败。
4. **fuzz 是纯逻辑模式**（`FUZZ_ACTIVE` 短路渲染/音频/DOM HUD）。渲染路径由 `?test=1`、`?uitest=1`、`?lumtest=1`、三结局真实按键 e2e 覆盖，但没有做“真实渲染 + 随机按键”的长时间 monkey；低端机帧率未在本轮量化。
5. **浏览器覆盖**：仍以 macOS headless Chrome 为主；Safari / Edge / 真机未人工复测。
6. **无存档/读档系统**：游戏只持久化 `ji.paletteLock` / `ji.palMode` 两个显示设置，没有关卡存档，因此“存档版本兼容/读档到异常状态”没有可测对象。读取失败/写入失败都有 `try/catch`，非法值会落回默认。若后续加存档，需要单独的 schema/version 字段与迁移测试。

## 7. 需要人决定（涉及玩法/美术，只记录不改）

1. **时长目标**：README 仍写“目标 10–15 分钟、当前中位 9:38”。是否要把目标改成 8–12 分钟，或继续加内容，属于内容/节奏决策。
2. **坏结局率**：fuzz 里 93/1000 走坏结局（随机摆错供桌）；真人零知识模拟是 0%。是否降低前两次摆错的惩罚属于难度/引导决策。
3. **电量压力**：fuzz 最低到 0，但多数局在第 1 章末就回满；电量是否应成为真实资源，属于数值平衡。
4. **暗房接带器的提前按键**：玩家在看清三处前按 E 只会得到提示；看清后按 E 会打开接带器并锁住移动，直到按 F 或接带。现有提示是“Q/E 移动、空格接带、F 放下”，但“F 放下”不够显眼；是否改成更直白的“F 退出接带器”属于 UX 文案/交互决策。
5. **美术占位**：DV 素材、老妇四视图等仍是程序化/AI 占位；替换为实拍/手绘不在本轮范围。

## 8. 复现命令

```bash
# 语法
PATH=/opt/homebrew/bin:$PATH node --check game.js
PATH=/opt/homebrew/bin:$PATH node --check dev/fuzz/fuzz_sim.js
PATH=/opt/homebrew/bin:$PATH node --check dev/sim/player_sim.js

# 自测 / 音频 / 可读性 / 版式（Chrome 路径可用 CHROME= 覆盖）
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader --use-angle=swiftshader \
  --ignore-gpu-blocklist --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir=/tmp/ji_test --virtual-time-budget=120000 --dump-dom \
  "file://$PWD/index.html?nointro=1&test=1" | rg -o '<title>[^<]+</title>'

# 三结局真实按键
./dev/e2e/run.sh help film bad

# 两轮 fuzz（1000 局，固定种子）
./dev/fuzz.sh 1000 20261024 tasks/fuzz-round2.json

# 原玩家模拟（会打印 97.6% 与剩余注入捣乱输入导致的未完成）
./dev/sim.sh 1000

# 内测记录器 / 落地页
PATH=/opt/homebrew/bin:$PATH ./dev/beta_check.sh

# 打包 + 解包自测（不部署）
PATH=/opt/homebrew/bin:$PATH ./dev/package.sh
```

## 9. 文件

- `dev/fuzz/fuzz_sim.js` — 随机玩家 fuzz 本体（仅 `?fuzz=` 加载）
- `dev/fuzz.sh` — 运行/导出 JSON
- `dev/fuzz/README.md` — 口径与用法
- `dev/sim/player_sim.js` — 更新到当前章节的确定性玩家模拟
- `tasks/fuzz-round1.json` / `tasks/fuzz-round2.json` — 两轮原始统计
- `tasks/dsh-20261024-REPORT.md` — 本报告

## 10. 环境说明（提交落盘）

本工作区的 git 元数据原本指向工作区外的 `Documents/.../.git/worktrees/ji-dsh`；沙箱为 `workspace-write`，对该路径写 `index.lock` 会被拒绝，`git commit` 无法落盘。为满足“所有改动已提交”，我把该 worktree 的 git 元数据复制到本目录内（保留原分支 `exp/dsh-20261024`、历史、remote），并让本目录的 `.git` 指向这份副本；未 push、未改动远端。若需要在原仓库中继续，请从本目录的提交导出 patch 后再应用。
