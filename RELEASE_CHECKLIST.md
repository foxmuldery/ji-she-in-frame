# Release checklist — v2.10.1

> 当前状态：可完整通关三结局（含第二幕暗房），真实按键回归已入库，首次游玩中位 9:38。
> 机器可验的部分见 `./dev/verify.sh`；下面是仍需**人**做的部分。

## 自动门（本地一条命令）

```bash
./dev/verify.sh
```

应全部通过：

- [x] `node --check game.js`
- [x] 72/72 自测（`?nointro=1&test=1` → `TEST PASS 72/72`），含暗房进入、三处显影、接带失败不锁死、接带成功、洗印、门口退出、回房间
- [x] 34/34 运行时音频（`?nointro=1&novideo=1&audiodbg=1` → `AUDIO PASS`），含 2026-10-22 重交付的 28 个 192 kbps 母带
- [x] 可读性审计（`?nointro=1&lumtest=1` → `LUM PASS 23/23`）：暗房三处显影 / 接带面板 / 走廊三处观察，在模拟 55% 显示增益下仍有高光与局部对比；字幕 ≥ 4.5:1
- [x] UI 版式审计（`?nointro=1&uitest=1` → 1280×720 / 1024×768 / 800×480 / 1366×768 / 1920×1080 / 2560×1440 六档均 `UI PASS`）
- [x] 真实按键三结局（`?e2e=help|film|bad` → 三个 `E2E PASS`）
- [x] 内测加密门（`./dev/deploy_beta.sh --dry-run && node dev/beta_gate/gate_check.mjs` → `GATE PASS 15/15`）
- [x] 发布审计（`node dev/release_audit.mjs` → `AUDIT PASS 72/72`）：版本号在 README / TRIAL_PLAY / CHECKLIST / store 四处一致；zip 比源码新且含当前 `game.js`；zip 内无 `dev/` `playtest/` `store/` `assets/references` `assets/prompts` 与 PNG 母版；`index.html` 不带内测钩子、不带 `noindex`；**包内每个素材都能在 MANIFEST / SOUND_MANIFEST / CREDITS / RIGHTS 里找到出处**；SHA-256 与 `.sha256` 一致；预告片时长/分辨率/音轨符合商店要求；商店文案版本号、描述内每张图、第二幕与预告片是否在、桌面键鼠与 AI 声明是否在；README 顶栏链到的文档必须带当前版本或 `HISTORICAL`
- [x] **解包冒烟**（`verify.sh` 自动）：把 zip 解到 `/tmp` 后直接 `file://` 打开，`TEST PASS 72/72`，且 `game.js` 里引用的每个 `assets/…` 路径在包内都存在——证明玩家拿到的东西本身能跑，而不只是仓库能跑

## 打包

```bash
./dev/package.sh
```

- [x] 只含运行时文件 + README/TRIAL_PLAY/RIGHTS/CREDITS/RELEASE_CHECKLIST/VERSION
- [x] 输出 `dist/ji-she-in-frame-v2.10.1.zip` 与 `.sha256`
- [x] 解包后 `?test=1` 与 `?audiodbg=1` 均通过（2026-10-22 复验：`TEST PASS 72/72` / `AUDIO PASS`）
- [x] 打包在 `verify.sh` 内自动完成，随后跑 `release_audit`，不会出现“改了代码但 dist 还是旧的”

## 内测发布（可选，与发布包分开）

```bash
./dev/deploy_beta.sh --dry-run   # 只构建 .beta-site/
./dev/deploy_beta.sh             # 推 gh-pages 并等 Pages 构建
```

- [x] 内测入口 <https://foxmuldery.github.io/ji-she-in-frame/playtest/beta.html>（`noindex`，不收录）
- [x] 试玩密码门槛：`game.js` / `beta.html` / `report.html` 以 AES-256-GCM 密文发布，`/game.js` 线上 404；密码只在 `dev/.beta_pass`（gitignore）或 `$BETA_PASS`，仓库与 Pages 均无明文
- [x] 记录器 `?rec=1`：`REC PASS`（本地 + Pages），真实按键 e2e 记录 550 事件 / 269 按键
- [x] 复盘页 `playtest/report.html` 可离线拖入 JSON
- [ ] 真实玩家跑 3–5 局，回收 JSON + 录屏，按「最长停顿 / 字幕停留 < 2s / 卡顿 > 250ms」三条筛问题

## 上架前人工确认

- [ ] Chrome / Edge / Safari 各手动跑一遍（Safari 的 `file://` 媒体策略仍未系统验收）
- [ ] 戴耳机完整听一遍 34 个音频，确认无爆音、无循环接缝
  - 机器已验：34/34 解码通过；无文件峰值 ≥ -0.5 dBFS；`bulb_hum.wav` / `window_rain.wav` 补增益后循环接点零跳变。
  - 仍需人耳：新母带补了 3–17 dB 增益（`dev/audio/delivery_gains.tsv`），请确认 `breath` / `oldwoman_breath` / `shutter` 三处没有把底噪一起抬上来。
- [x] 1920×1080 / 2560×1440 像素缩放与排版（`--u` 随舞台高度缩放，`uitest` 六档覆盖最长串不裁切、面板不出画或可滚动）
- [ ] 确认「闪烁效果：柔和」对光敏用户足够；必要时默认开启
- [x] 走廊三处 `F` 观察、暗房三处「红灯显影」在低亮度显示器上仍看得清（`lumtest` 以 55% 增益 + 8 级黑位模拟暗屏，23/23）
  - 仍需真屏：一档 TN / 笔记本实际观感，特别是暗房接带面板的 1–2% 错位是否肉眼可辨
- [ ] 暗房接带：用真实按键从偏移 +30% 对到红线，确认手感与提示一致（模拟已覆盖，人耳/人手未验）
- [x] 录 20–30 秒商店视频（`./dev/trailer/run.mjs` → `store/trailer_26s.mp4`，26.0 s / 1280×720 / 30 fps / H.264 + AAC，封面 `store/cover_1280x720.jpg`）
  - 仍需人耳：预告片的音乐落点与画面切口是否同一拍
- [ ] 上传 itch：`store/cover.jpg` → `store/01…10c`（含暗房三张）→ zip → `store/itch_description.html`
- [ ] 商店页保留「占位素材 / 正式版替换实拍」的说明
- [ ] 三人首次试玩计时，中位 ≥8 分钟（当前模拟值 9:38 / p90 10:42，需真人复核）

## 商业发行前必须替换

- [ ] 5 秒 DV clip：实拍或已授权素材
- [ ] 老妇面部 / 等距参考 / 关键美术：手绘或已授权素材
- [ ] 音乐 / 音效 / 语音：确认 MiniMax 生成内容的商用条款，或替换
- [ ] 字体：当前仅用系统字体；若嵌入需授权
- [x] 第二幕（暗房 / 断带 / 洗印）已收入（v2.10）
- [ ] 10–15 分钟时长：当前中位 9:38，仍需第三幕或延长第二幕
- [ ] 存档、设置持久化、手柄 / 移动端适配

## 复现验证

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --use-angle=swiftshader --ignore-gpu-blocklist \
  --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir=/tmp/ji_qa --virtual-time-budget=50000 \
  --dump-dom "file://$PWD/index.html?nointro=1&test=1" | grep -o 'TEST PASS'

./dev/e2e/run.sh
```
