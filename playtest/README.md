# 内测试玩记录器

只在 `?rec=1` 时加载，发布 zip 不含本目录。

## 文件

| 文件 | 作用 |
| --- | --- |
| `recorder.js` | 记录器本体。由 `game.js` 在 `?rec=1` 时动态注入；自建 DOM + 样式，不改游戏逻辑。 |
| `recorder.css` | 记录器 UI（右下角胶囊 + 面板 + toast）。 |
| `report.html` | 复盘页。单文件、离线可用；拖入 JSON 出报告，可导出 Markdown / CSV。多份记录会多出「全部 N 份」页：结局分布、时长中位与范围、各遍中位耗时、中途停在第几遍、停顿/卡顿汇总。`?demo=1` 载入三份合成示例，`?demo=1&agg=1` 直接看汇总页。 |
| `beta.html` | 内测落地页：入口、三步录法、本次重点、隐私说明。 |

## 发布时会被加密

`gh-pages` 是公开分支，所以 `./dev/deploy_beta.sh` 会把 `game.js`、`beta.html`、`report.html` 加密成 `playtest/{game,beta,report}.enc` 再发布，并生成：

| 文件 | 作用 |
| --- | --- |
| `playtest/unlock.html` | 统一的密码页；校验通过后把派生密钥写进本标签页的 `sessionStorage`。 |
| `playtest/gate.js` | PBKDF2-SHA256（310k）派密钥 + AES-256-GCM 解密；`mount()` 解整页，`injectScript()` 解 `game.js`。 |
| `playtest/gate.json` | 只有盐、迭代次数和一段已知明文的校验块；不含密码。 |
| `playtest/boot.js` | `index.html` 的引导：解密 `game.enc` 并注入；失败则回解锁页。 |

密码来源：`$BETA_PASS` 或 `dev/.beta_pass`（已 gitignore）。仓库与部署产物里都没有明文密码。
验收入口：`./dev/deploy_beta.sh --dry-run && node dev/beta_gate/gate_check.mjs`（15 条真实按键断言）；对已发布站点用 `node dev/beta_gate/gate_check.mjs --live`。

## 记录器记什么

只读两个来源，因此游戏怎么改都不用跟着改：

1. `window.__jiThird.state` — 5 Hz 采样后做差分（章节、场景、电量、进度、仪式、躲藏、暗房…）。
2. DOM 上玩家看得见的文字 — `#subtitle` / `#prompt` / `#chapterHud` / `#endTitle`，用 `MutationObserver` 抓，附带每句的实际停留时间。

事件类型：`begin` `state` `key` `say` `prompt` `goal` `chapter` `ending` `endscreen` `gap`（>20s 无操作）`jank`（>250ms 掉帧，仅在真正游玩时统计）`error` `rec` `export` `mark`。

导出结构（`schema: ji-playtest/1`）：

```jsonc
{
  "schema": "ji-playtest/1",
  "session": { "id", "startedAt", "endedAt", "tester", "notes", "userAgent", "viewport", "dpr", "language", "timezone" },
  "summary": { "durationMs", "gameSeconds", "ending", "chapter", "keys", "keyCounts",
               "longestGapMs", "jank", "jankMaxMs", "errors", "progress" },
  "events": [ { "t": 1234, "type": "say", "text": "…" } ],
  "finalState": { "…": "结束时的完整状态快照" }
}
```

## 录屏

`getDisplayMedia` + `MediaRecorder`（VP9 → VP8 → webm 回退），码率 1.2 / 3 / 6 Mbps，可选混入麦克风（`getUserMedia` 音频）。全程本地：停止时生成 `.webm` 由浏览器下载，没有任何上传路径。

## 隐私

无后端、无账号、无第三方统计。唯一持久化是 `localStorage['ji.rec.v1']`（用于刷新/崩溃后“导出上次”），导出后可清。落地页与复盘页均 `noindex`。

## 部署

```bash
./dev/deploy_beta.sh --dry-run   # 只构建 .beta-site/
./dev/deploy_beta.sh             # 推 gh-pages 并等 Pages
```

`gh-pages` 是独立分支；`main` 不受影响。

## 自检

```bash
node --check playtest/recorder.js
# 本地：标题/页面出现 #recRoot，6 秒后 #recVerdict[data-verdict]=PASS
open "index.html?nointro=1&rec=1&rectest=1"
```
