# 随机玩家 fuzz（1000 局）

只由 `index.html?fuzz=N&fuzzseed=<seed>` 加载；`dev/` 不进发布包。

## 跑

```bash
./dev/fuzz.sh                    # 1000 局，seed 20261024
./dev/fuzz.sh 200 12345          # 快跑
./dev/fuzz.sh 1000 20261024 tasks/fuzz-round2.json
```

`dev/fuzz.sh` 只做三件事：起 headless Chrome、读 `<body data-fuzz>`、打印/写出 JSON。
退出码非 0 只表示这一次没有产出结果（脚本缺失/页面没跑起来），不表示发现 bug。

## 每局怎么跑

- 用 `G.startGame(false)` 启动真实状态机；移动走 `blocked()` + `advanceMovement()`，
  交互走 `interact()` / `setCamera()` / `takePhoto()` / `commitRitual()` 等键盘同款函数。
- 每一步都从该局种子的 RNG 里选：三个供品的顺序、先看哪个藏点、走错哪个点、
  是否摆错一次供、是否在 3.6 秒结局卡期间打开回看、是否在打字/转场时连按 Esc/Tab/F/L。
- 10% 的局是纯 chaos：不找目标，只按合法动词乱按到步数上限，用来撞重入/覆盖层问题。
- 每 tick 检查不变量：NaN/Infinity、坐标/深度越界、电量越界、章节/场景非法、
  计数为负或超上限、结局后回看仍打开。`window.onerror`、`unhandledrejection`、
  `console.error` 都计入问题。
- 终止条件：到达结局、120 秒无进展（章节/场景/计数/覆盖层签名完全不变）、
  或 1200 秒模拟时钟上限。种子可复现，同一 seed 的整局决策序列相同。

## 口径

`playerCompletionPct` 只统计 `mode=player` 且到达 `help`/`film`；`bad` 是坏结局，
`CHAOS_CAP` 是 chaos 局按设计撞到上限，二者都不算“卡死”。`noEnding` 只统计
player 局。报告里的两轮分别对应修 bug 前 / 修复后的同一套 1000 局。
