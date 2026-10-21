# 《祭：她在画面里》v2.4：渲染管线与代码质量审计

审计对象：`index.html`（206 行）、`style.css`（495 行）、`game.js`（6153 行，268 KB）、`vendor/retrozone-shader.js`（803 行）和 `assets/`、`dist/ji-she-in-frame-v2.4/`。
范围：game.js 第 1–3250、3960–4407、4875–5300 行以及 frame()，加上全文件的代码质量检查。游戏逻辑（3250–3960、4407–4875、5298–5900）只在横切问题处顺带提到。
方法：
- 静态分析：用 acorn AST 统计函数体量和调用图可达性，脚本放在 `/tmp/ji_audit_r/analyze.js`、`reach.js`、`timers.js`、`scope.js`。
- 运行时测量：在 file:// 下用 headless Chrome 155 + CDP 测量（`/tmp/ji_audit_r/cdp.js`），统计每帧耗时、texImage2D、putImageData 和渐变分配，并对截图做 PSNR 对比。
- 离线基准：LightRig 重建耗时（`/tmp/ji_audit_r/lightbench.js`）。
- 资源试压：用 ffmpeg 重编码，产物在 `/tmp/ji_audit_r/enc/`。

全程**未修改任何源文件**。

严重度：**P0** 表示会造成可见的功能损坏或数据错误，应在发布前修复；**P1** 表示明显的性能、体验或可维护性风险；**P2** 是改进项。
工作量：**S** 不超过半天，**M** 为 1–2 天，**L** 为 3 天以上。

---

## 0. 结论速览

| # | 严重度 | 结论 | 工作量 |
|---|---|---|---|
| R1 | **P0** | file:// 下 `FACE_CLOSEUP_IMG` 会污染 #camera，RetroZone 的 `texImage2D` 抛 SecurityError，WebGL 循环永久死亡，CRT 覆盖层停在最后一帧并一直盖在画面上。已复现。 | S |
| R2 | P1 | RetroZone 覆盖层隐藏（display:none）时，仍然每帧上传 1280×960 纹理（4.9 MB/帧），并且每帧调用 getBoundingClientRect、重设 canvas 宽高 | S |
| R3 | P1 | LightRig 占三人称帧 CPU 的约 75%（1.90 ms 对比 0.47 ms），按帧计数节流，120 Hz 屏幕上翻倍；举起 DV 时它仍在算 | M |
| R4 | P1 | 举 DV、回看时仍每帧完整绘制三人称房间和 LightRig，画面被 92% 黑罩和 #camera 遮住，属于纯浪费 | S |
| R5 | P1 | DV 视频（1344×768，16:9）和 poster 被直接拉进 960×720 / 640×480（4:3），水平压缩约 24%，人脸被拉窄 | S |
| R6 | P1 | 没有 blur/visibilitychange 处理：切窗口后按键卡住（角色一直走、DV 一直举着）；后台继续放音、计时 | S |
| R7 | P1 | 暂停时不冻结任何东西：43 个 gameplay setTimeout、clock/water setInterval、performance.now() 截止时间、WebAudio 底噪都照常走；重开也不清理计时器 | M |
| R8 | P1 | 无 WebGL context lost/restored 处理 | S |
| C1 | P1 | 不可达代码 665 行（10.8%），含整套旧版矢量摄像机 drawCameraScene / drawCameraXie / drawCameraRig 共 557 行；生产包另带 338 行测试与调试代码、41 个 URL 参数 | S |
| C2 | P1 | 单个 IIFE 内有 208 个函数声明、122 个闭包变量（28 个 `let`）、`state` 对象 76 个键，被引用 1167 次；初始状态在两处重复（246–257 行与 5626–5633 行） | L |
| A1 | P1 | 运行时包 14.2 MB，保持质量可降到约 6.2 MB（−57%）；仓库 `assets/` 中 39.9 MB 未被引用 | S–M |
| H1 | P1 | 游戏开始后 Tab 被劫持为打开记录面板，暂停菜单无法用键盘遍历；在按钮上按 Space 会被 preventDefault 吞掉 | S |
| H2 | P2 | 20 个按钮均无 `type`；模态层无 role=dialog 和焦点管理；字幕无 aria-live；HUD 有 42 处 8–12 px 固定字号；控制提示对比度约 2.3:1 | M |

---

## 1. 渲染管线与性能

### 实测基线

headless Chrome 155，file://，DPR=2，1600×900，Apple Silicon，每段 3 s 窗口：

| 场景 | frame() 平均 / p95 / 最大 (ms) | RetroZone render | texImage2D | putImageData | 渐变分配 |
|---|---|---|---|---|---|
| 三人称（`novideo`，LightRig 开） | 1.90 / 3.7 / 10.0 | 182 次/3 s（覆盖层隐藏中） | 182 | 90 | 0 |
| 三人称 `?light=0` | **0.47** / 0.8 / 0.9 | — | — | 0 | 0 |
| 像素 DV（camera on） | 1.92 / 3.5 | — | 已污染而崩溃 | 90 | 180（1/帧） |
| 视频 DV（videoActive） | 1.62 / 2.9 | 181（覆盖层 display:none） | 181 | — | 0 |
| 回看 static | 0.43 / 0.9 | — | — | 0 | — |
| 回看 gap+split | 1.75 / 3.3 | — | — | 91（split 内 drawThirdPerson 又跑了 LightRig） | — |

高端机上帧预算很宽裕。但这些数字在低端集显或 Chromebook 上大约要乘 4–6，而且 LightRig 每两帧才重建一次，导致帧耗时 3 ms 与 0.5 ms 交替（锯齿形 frame pacing）。

---

### R1 [P0] 老妇脸部特写污染 #camera，RetroZone 永久崩溃 · S

**证据**
- `game.js:45-46`：`FACE_CLOSEUP_IMG.src='assets/references/v2/ji_oldwoman_face_v2_480.png'`。在 file:// 下每个文件都是独立 origin，所以这张图是跨源图片。
  对照：poster 已经刻意改用同源 data URI 来规避这个问题（`assets/poster_data.js` 文件头注释写的就是 “so the DV canvas stays untainted for WebGL”），脸图却漏掉了。
- 绘制入口有两处，都画在 `cctx`（#camera）上：
  - `drawReview()` 的 look 分支，`game.js:5141`：`drawFaceCover(ctx,CW,CH,…)`。回看进度条 0.60–0.70 区间（`updateReviewKind` 3877 行）每次都会进入，这是设计内的逐帧找眨眼玩法。
  - `drawCameraPixelScene()` 末尾，`game.js:4402-4403`，调用 `drawCameraFaceCloseup` → `drawFaceCover`（4032 行）。首次在老妇面前举 DV 时触发（3629 行），前提是视频未就绪或处于 pending、failed、novideo。
- `vendor/retrozone-shader.js:661`：`gl.texImage2D(..., gameCanvas)` 没有 try/catch，异常从 rAF 回调抛出后不再调用 `requestAnimationFrame(render)`。
- `game.js:156-157`：`retroStarted=true` 之后再也不会重建；`syncCameraOverlay()`（169–174 行）照旧把覆盖层设为 `display:block`。

**复现**（`/tmp/ji_audit_r/run_*.json`）
- `?nointro=1&review=1&pos=0.18`：normal 段 2 s 内 render 120 次 → 切到 look 段只剩 1 次 → 之后 gap 段 0 次。#camera 调用 `getImageData` 抛 `SecurityError`，控制台报 `Tainted canvases may not be loaded`。
- `?nointro=1&novideo=1`：举 DV 走到老妇面前，同样崩溃。
- 截图 PSNR：有 shader 时，“特写帧”和“特写结束后”两张截图与崩溃前的远景帧几乎一样（约 29–30 dB，说明画面被冻结）；`?noshader=1` 时同样两张差异巨大（9.7–12.9 dB，画面正常更新）。

**影响**
- 玩家看不到老妇特写，这是第一次 jump-cut 的重点镜头。
- 此后整局所有像素 DV、扫描、回看画面都被一张冻结的 CRT 帧盖住（覆盖层 z-index 3，正好在 #camera 之上），直到刷新页面。
- 自测 46/46 没有覆盖这个问题。

**修复**
1. 把脸图也转成同源 data URI。顺带改为 JPEG：base64 后约 32 KB，PNG 的 base64 约 240 KB。
   ```js
   // assets/face_data.js（生成脚本与 poster_data.js 相同）
   window.JI_FACE_DATA="data:image/jpeg;base64,...";
   // game.js:46
   FACE_CLOSEUP_IMG.src = window.JI_FACE_DATA || 'assets/references/v2/ji_oldwoman_face_v2_480.png';
   ```
2. 对 vendor 做防御性补丁：异常时销毁覆盖层并回退到 CSS CRT。
   ```js
   // retrozone-shader.js render() 内
   try { gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,gameCanvas); }
   catch (e) { running=false; overlay.style.display='none'; options.onError && options.onError(e); return; }
   // game.js initRetroDisplay()
   onError:()=>{ retroDisplay=null; stage.classList.add('noShader'); }   // #stage.noShader #crt{display:block}
   ```
3. 在 runTest 中加一条断言：进入 look 和特写后，`camera.getContext('2d').getImageData(0,0,1,1)` 不抛异常。

---

### R2 [P1] RetroZone 隐藏时仍满负荷运行，且每帧触发布局 · S

**证据**
- 覆盖层 `display:none` 时（三人称、视频 DV 状态），3 s 内 render 182 次、texImage2D 182 次，每次上传 1280×960×4 ≈ 4.9 MB，约 295 MB/s 的上传带宽被白白消耗。
- `vendor/retrozone-shader.js:649`：`render()` 每帧调用 `updateOverlayPosition()`，其中 `getBoundingClientRect()` 会强制样式和布局，随后又无条件执行 `overlay.width = rect.width; overlay.height = …`（528–531 行）。
  - 给 canvas 的 width 赋值，即使数值相同，也可能导致绘制缓冲区重新分配或清空。
  - `rect.width` 是小数，被截断后与 style 宽度不一致，会产生一次额外的重采样。
- 覆盖层的 backing store 使用 CSS 像素，没有乘 `devicePixelRatio`（528 行）。实测 DPR=2 时只有 1164×873，再被浏览器放大 2 倍，CRT 扫描线和荫罩会发糊。

**修复**（直接修改已 vendored 的副本，MIT 许可允许）
```js
let visible = true;
function render(){
  if (!running) return;
  rafId = requestAnimationFrame(render);
  if (!visible) return;                       // 隐藏时什么都不做
  ...
}
const ro = new ResizeObserver(updateOverlayPosition); ro.observe(gameCanvas); // 替代每帧测量
function updateOverlayPosition(){
  const r = gameCanvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio||1);
  const w = Math.round(r.width*dpr), h = Math.round(r.height*dpr);
  if (overlay.width!==w || overlay.height!==h){ overlay.width=w; overlay.height=h; }
  ...
}
return { ..., setVisible(v){ visible=v; overlay.style.display=v?'block':'none'; } };
```
`game.js:169-174` 的 `syncCameraOverlay()` 改为调用 `retroDisplay.setVisible(on)`。

另外，覆盖层被 append 到 `<body>`（`vendor:534`），脱离了 #stage，叠放顺序依赖 #stage “不构成层叠上下文”这一隐含前提。将来只要给 #stage 加上 `transform`、`filter` 或 `z-index`（例如整数倍缩放方案），HUD 和弹层就会被它盖住。建议给 vendor 加一个 `options.container` 参数，挂进 #stage 并使用 `inset:0` 定位。

---

### R3 [P1] LightRig：CPU 热点，节流方式依赖刷新率 · M

**证据**
- `game.js:1725-1757`：每次重建对 480×270 = 129,600 个像素 × 3 盏灯做逐像素椭圆衰减、Bayer 抖动和量化，再 `putImageData`。
- `game.js:1761`：`if (!first && acc % 2) return;` 按**帧数**节流。60 Hz 屏上是 30 次/s，120 Hz ProMotion 屏上变成 60 次/s，CPU 开销翻倍。
- 实测：LightRig 开启时帧均值 1.90 ms，`?light=0` 时 0.47 ms，**LightRig 约占 75%**，p95 从 0.8 ms 升到 3.7 ms。
- 三盏灯的位置和半径都是常量（1764–1766 行），每帧变化的只有两个闪烁系数，但衰减场每次都从头计算。

**修复**（离线基准 `lightbench.js`：3.10 → 1.42 ms/次，提速 2.2×，输出逐像素一致）
1. `ensure()` 时为每盏灯预计算一张 `Float32Array(PW*PH)` 衰减图 `f²`，重建时只做加权求和。
2. 只遍历所有光源 bbox 的并集（110..428 × 0..182，占全屏 45%），并集以外直接填环境光常量。这块可以在 `ensure()` 时一次性写好。
3. 改为按时间节流：`if (now - lastBuild < 33) return;`，与刷新率无关。
4. camera on、review、paused 时跳过 `update()`（见 R4）。
5. 更进一步：只有烛光每帧闪烁，可以单独只重建烛光 bbox（约 104×88），顶灯的闪烁量化到 4 档后缓存。

---

### R4 [P1] DV 和回看期间仍绘制被遮住的三人称场景 · S

**证据**
- `frame()`，`game.js:5576-5580`：`drawThirdPerson(pctx,…)` 无条件执行，随后在 camera on 时用 `rgba(0,0,0,.92)` 盖住整个 pixel 画布。
- #camera 本身占 75% 宽度且背景不透明。
- 回看分支（5544–5545 行）虽然不画 #pixel，但 split 模式（5189 行）又对 `reviewPctx` 每帧跑一次 `drawThirdPerson`，也就是 LightRig 和 putImageData 再来一遍。实测 split 模式 3 s 内 putImageData 91 次。

**修复**
- camera 刚举起的那一帧画一次 #pixel 并缓存（两侧只露出 8% 亮度的边条），之后直到放下前都跳过 `drawThirdPerson`。
- 重建小窗（split）降到 15 fps 刷新，或者不调用 `LightRig.update()`，只复用最近一次结果。
- 预计举 DV 期间每帧节省约 1.4 ms。

---

### R5 [P1] DV 素材宽高比错误（16:9 被压成 4:3） · S

**证据**
- `ffprobe` 显示 `footage_clip_5s.mp4` 和 `ji_clip_v1_poster.jpg` 都是 **1344×768（16:9）**。
- `game.js:3218`：`dvCtx.drawImage(dvVideo,0,0,960,720)`；`game.js:3231`：`ctx.drawImage(POSTER_IMG,0,0,CW,CH)`（640×480）。两处都没有裁切。
- 水平缩放因子 = (960/1344)/(720/768) = **0.762**，画面中的人物被压窄约 24%。CSS 中 `#dvVideo{object-fit:cover}` 是为 video 元素写的，但该元素是 `visibility:hidden`，不起作用。

**修复**：做中心裁切，按 cover 方式绘制。也可以在离线转码时直接裁成 4:3（1024×768），这样解码量也更小。
```js
function drawCover(g, src, sw, sh, dw, dh){
  const s = Math.max(dw/sw, dh/sh), w = dw/s, h = dh/s;
  g.drawImage(src, (sw-w)/2, (sh-h)/2, w, h, 0, 0, dw, dh);
}
drawCover(dvCtx, dvVideo, dvVideo.videoWidth, dvVideo.videoHeight, 960, 720);
```
另外 `drawVideoFrame` 以 rAF 频率（60 或 120 Hz）重绘 24 fps 的视频，60 Hz 下约 2.5 倍冗余。可以改用 `video.requestVideoFrameCallback`（Chrome、Safari 15.4+ 支持），不支持时退回 rAF。

---

### R6 [P1] 失焦或切后台：按键卡住、声音继续 · S

**证据**
- 全文件 0 处 `visibilitychange`，0 处 `window` 的 `blur` 监听。
- `keys.*` 只在 keyup 时清零（5465–5471 行）。按住 W 时 Alt-Tab 或 Cmd-Tab 切走，keyup 丢失，回来后角色会一直走。按住 F 或右键举 DV 时切走，DV 一直处于举起状态，`dvBtn` 的 `pointerleave` 也救不回来。
- rAF 在后台会停，但 HTMLAudio 环境声和音乐，以及 `clockTimer`、`waterTimer`（500–507 行）照常运行。

**修复**
```js
function releaseInputs(){ keys.left=keys.right=keys.up=keys.down=false; if (state.camera) setCamera(false); }
window.addEventListener('blur', releaseInputs);
document.addEventListener('visibilitychange', ()=>{
  if (document.hidden){ releaseInputs(); if (state.started && !state.ended) pauseGame(); }
});
```

---

### R7 [P1] 计时器与暂停、重开的生命周期 · M

**证据**（`timers.js` 基于 AST 统计）
- gameplay 区（5816 行之前）共 43 个 `setTimeout`，只有 3 个保存了句柄，只有 2 个检查 `state.paused`，11 个回调会播放音效或显示字幕，19 个回调完全没有 `if` 守卫。
- 没有守卫的例子：`4477 setTimeout(apply,700)`、`4509 setTimeout(apply,500)`、`4788 setTimeout(()=>startChapter(4),1100)`、`4535 setTimeout(back,2200)`、`5321`。在过场中按“重新开始”，旧回调会落到新的一局里。`reset()`（5618 行）只清了 `uncannyTimer`。
- 暂停时的问题：
  - `clockTimer` 的守卫是 `!state.started||state.ended||state.muted||!bedActive`（501 行），没有检查 paused，所以**暂停菜单里每 11 s 会响一次钟**。
  - `pauseGame()`（5711 行）没有 `actx.suspend()`，WebAudio 底噪（`hissSrc`）和 drone 会继续。
  - 所有基于 `performance.now()` 的截止时间（`scanStart` 4880 行、`closeupUntil`、`photoFlashUntil`、`photoRevealUntil`、`scareUntil`、`lastBatteryAt`）都没有扣除暂停时长，扫描显影进度在恢复后会瞬间跳完。
- `frame()` 的 dt 已经 clamp 到 0.05 s（5506 行），这点做得对，但 `state.time` 之外的计时都不受这个保护。

**修复**：用一局作用域的“游戏时钟”加计时器注册表。
```js
const runTimers = new Set();
function later(fn, ms){ const id=setTimeout(()=>{ runTimers.delete(id); if(!state.paused) fn(); else deferred.push(fn); }, ms); runTimers.add(id); return id; }
function clearRunTimers(){ for (const id of runTimers) clearTimeout(id); runTimers.clear(); }
// reset() 开头调用 clearRunTimers()
// 用 state.time（已由 dt 推进、暂停即冻结）替代 performance.now() 做截止时间：
state.closeupUntil = state.time + 1.5;
```
在 `pauseGame()` 和 `resumeGame()` 中分别调用 `actx.suspend()` 和 `actx.resume()`。

---

### R8 [P1] 无 WebGL 上下文丢失处理 · S

**证据**：vendor 和 game.js 中 `webglcontextlost` 出现 0 次。GPU 重置、macOS 双显卡切换、睡眠唤醒都可能丢失上下文，之后 gl 调用全部成为空操作，覆盖层停在黑帧或旧帧。

**修复**
```js
overlay.addEventListener('webglcontextlost', e=>{ e.preventDefault(); running=false; overlay.style.display='none'; onError&&onError(); });
overlay.addEventListener('webglcontextrestored', ()=>{ /* 重新 buildProgram + makeFBO 后 running=true; render(); */ });
```
最简做法是 lost 时直接 destroy 并回退到 CSS CRT（同 R1 第 2 步）。

---

### R9 [P2] 每帧分配与重复绘制（热路径微优化） · S

| 位置 | 问题 | 建议 |
|---|---|---|
| `drawCameraPixelScene` 4115–4130 | 每帧新建含 44 个颜色键的调色板对象 `P` | 提升为模块常量 `CAM_PAL` |
| 同上 4398–4400 | 每帧 `createRadialGradient` 做暗角（实测 1 个/帧），参数恒定 | 一次性预渲染到 640×480 离屏 canvas，或缓存 gradient 对象（同一 ctx 可复用） |
| `drawThirdPerson` 971–980 | 每帧新建 items 数组、4 个闭包并排序 | 只有 Xie 的深度会变，预排 3 个静态层后按 `wx+wy` 插入即可 |
| `renderCameraScan` 4896–4931、`renderHuntScan` 5061–5076 | 每帧拼接 `'rgba(…,'+a+')'` 字符串 | 改为 `ctx.globalAlpha=a` 加常量色 |
| `drawNoise` 3964（static 1600 次、split 700 次 fillRect + Math.random） | 每帧数千次绘制调用 | 预生成 4 张噪声 tile 轮换 `drawImage`，参考已有但未使用的 `makeGrain()` |
| `drawReview` 5152 | `ctx.drawImage(ctx.canvas,0,bandY,CW,16,…)`：画布在 setTransform(2) 下是 1280×960，源矩形却按逻辑坐标给出，实际复制的是左上四分之一区域，跟踪带错位。5602 行 glitch 用 `sy*2,CW*2,sh*2` 是正确写法 | 改为 `drawImage(ctx.canvas,0,bandY*2,CW*2,32,7,bandY,CW,16)` |
| `drawCameraOverlay` 3147 | 每帧设置 4–6 次 `ctx.font`（字体解析有开销） | OSD 的静态部分（边框、角标、机型字样）预渲染为一层，只动态绘制 REC 点、电量和时间码 |

`ctx.filter` 只在 `blur()`（569 行）中出现，而 `blur()` 只被不可达的 `drawCameraScene` 调用。所以当前**不存在**每帧 filter 模糊，Safari 不支持 filter 的问题也不会触发，直接删除即可。`getImageData` 只在不可达的 `ditherImage` 和调试代码里出现。

### R10 [P2] 烘焙层冻结了动画 · S

`ensureSceneLayers()`（779–803 行）以 `t=0` 一次性烘焙了 52 个绘制函数，其中 11 个使用 `t`，相应动画因此被冻结：
- `drawWindowNW` 1186 行的窗上雨痕
- `drawHangingBulb` 1647–1648 行灯泡周围的飞蛾或尘埃
- `drawOldWomanBody` 2178 行老妇的摇晃
- `drawOldWomanTableHand` 2258 行手边的烟

这些代码目前不会产生任何画面变化。如果确实想要这些动画，可以像 `drawTableDynamics` 那样拆成每帧的小覆盖层（都是几十个像素，成本很低）；如果不需要，就删除 `t` 相关代码，免得误导后来的维护者。

另外，缓存本身是有界的：`DITHER_TILES` 和 `DITHER_PATTERNS` 以“颜色字面量|档位”为键，颜色都来自 PAL 常量，`DITHER_PATTERNS` 用的是 WeakMap，没有无界增长风险。

### R11 [P2] 画布尺寸与缩放

- #pixel 是 480×270，在 1552 CSS px 宽的 stage 上缩放 3.23 倍（非整数），#camera 是 1280×960 映射到约 1164 px（0.91 倍）。在 `image-rendering:pixelated` 下，非整数倍会让像素宽度出现 3 和 4 交替的“抖格”。
  建议增加可选的“整数缩放”模式：按 `floor(min(innerW*dpr/480, innerH*dpr/270))` 计算倍数后，设置 stage 的 CSS 宽高（以设备像素为单位，再除以 dpr）。
- #camera 实际上就是把 640×480 的 `camLow` 做 2× 最近邻放大，再叠加 2× 的 OSD 文字。RetroZone 每帧上传的 4.9 MB 中有 3/4 是冗余像素。可以考虑让 RetroZone 直接采样 640×480 的合成层，OSD 改用 DOM 或第二层 canvas，上传量降到 1.2 MB/帧。
- CSS 中 `#camera` 和 `#dvVideoCanvas` 的 `filter:contrast() saturate()`（50 行、67 行）会给每帧变化的大图层额外增加一次 GPU 滤镜 pass。可以把这两个系数折算进 shader 或绘制颜色。

### R12 [P2] 音频引擎

- **iOS / iPadOS Safari 上 `HTMLMediaElement.volume` 是只读的**（恒为 1），`rampMedia`（412 行）的淡入淡出全部失效，环境声和音乐会以 100% 音量播放，设计值是 0.03–0.16。如果移动端不在支持范围内，请在商店页写明；否则需要改走 WebAudio 增益，用 `createMediaElementSource` 把元素接到 GainNode。
- 每个 key 只有一个 Audio 元素（396–411 行）。同一音效被连续触发时，例如回看逐帧时的 `clock`（5533 行），会互相打断（`currentTime=0`）。如需叠放，可以为高频音效准备 2–3 个元素轮转。
- MP3 的 `loop` 在 HTMLAudio 中存在编码器填充造成的循环接缝（ambience_45s、music_eerie_bed_90s）。WAV 无缝但体积大（见 A1）。最佳方案：短循环音频以 base64 内嵌到 JS（file:// 下可用，与 poster_data 同法），用 `decodeAudioData` 解码后交给 `AudioBufferSourceNode.loop=true`，做到采样级无缝。
- `rampMedia` 用 30 ms 的 `setInterval` 逐元素调节音量。可以接受，但改到 rAF 或 WebAudio `linearRampToValueAtTime` 会更平滑。

---

## 2. 代码质量与可维护性

### C1 [P1] 不可达代码与测试、调试代码混入生产包 · S

**不可达函数**：基于调用图可达性分析（`reach.js`），以 IIFE 内所有非函数语句为根。共 20 个函数、**665 行**，占全文件 10.8%。

| 函数 | 行 | 行数 |
|---|---|---|
| drawCameraScene | 2586–2821 | 236 |
| drawCameraXie | 2823–3015 | 193 |
| drawCameraRig | 3051–3145 | 95 |
| drawOldWomanHand | 3017–3049 | 33 |
| takeHuntPhoto | 4745–4769 | 25 |
| ditherImage | 3973–3990 | 18 |
| drawFootageBadge | 3203–3214 | 12 |
| ditherEllipse / ditherRect | 592–611 | 20 |
| updateHide | 4706–4714 | 9 |
| getBed, makeGrain, drawGrain | 465–470, 572–582 | 17 |
| ln, circ, ell, poly, grad, rgrad, blur | 563–569 | 7 |

如果再排除测试入口，还有 `updateBattery`（3359 行）和 `forceCameraOff`（3371 行）只被 `runTest` 调用（5912 行）。**这意味着正式游戏中 DV 电量永远不会消耗**，HUD 上的“DV 电 100%”、电量低时的红色样式和强制关机都不会出现。这属于逻辑问题，请逻辑审阅者确认是否为有意设计。

**测试与调试代码**：5816–6153 行共 338 行（5.5%）：
- 41 个 URL 参数：`aligned audiodbg bad camera case chapter clean clue corridor end eyes figure hand huntcam huntpos loop mismatch near nofx noglitch nointro noui novideo photo pos pose rdone reveal review ritual rtarget scan scare shelf split take2 test uncanny vfreeze videodbg vposter`，另有 1706 行的 `light` 和 166 行的 `noshader`。
- `runTest`（5892–6020 行，129 行）。
- `window.__jiThird` 对外暴露了 `state` 和内部函数（6147 行）。

**修复**：删除不可达函数，可借助 git 历史保留。调试和测试代码移到 `dev/debug.js` 和 `dev/selftest.js`，只在开发版 index.html 中引入，发布构建时剔除（见 C5）。如果必须保留在同一文件里，至少用 `const DEV=/[?&]dev=1/.test(location.search)` 统一门控。

### C2 [P1] 全局可变状态 · L

- 整个游戏是 1 个 IIFE：208 个函数声明，122 个闭包级绑定（94 个 const、28 个 let），另有 70 次 `getElementById`。
- `state` 有 76 个键（256 行是一行 702 字符），全文 `state.` 引用 **1167 次**。
- 初始化重复：`state` 字面量（246–257 行）与 `reset()`（5626–5633 行）各写了一遍，ritual 子对象逐字重复。目前 76 个键都已声明，但 `reset()` 只重置了其中一部分。例如 `chapter`、`scene`、`hunt`、`hide`、`anomalies`、`oldWomanGone`、`darkChapter` 都不在 `reset()` 里，是否由别处重置需要逻辑审阅者确认。
- 媒体、视频和 shader 状态分散在 9 个 `let video*` 变量和 `retro*` 变量中。

**修复**：用工厂函数生成初始状态，`reset` 时整体替换（如有引用需要保持，就用 `Object.assign`）。
```js
function makeRunState(){ return { wx:2.5, wy:6.5, ..., ritual:makeRitual(), photos:{incense:false,bowl:false,thread:false} }; }
const META_KEYS = ['muted','flashSafe','last'];                 // 跨局保留
function reset(){ const keep = pick(state, META_KEYS); Object.assign(state, makeRunState(), keep); }
```
按子系统把状态拆成 `state.run`、`state.review`、`state.ritual`、`state.media`、`state.settings`。

### C3 [P1] 函数体量

前 10 大函数（AST 精确行数）：

| # | 函数 | 位置 | 行数 |
|---|---|---|---|
| 1 | drawCameraPixelScene | 4111–4405 | **295** |
| 2 | drawCameraScene（不可达） | 2586–2821 | 236 |
| 3 | drawCameraXie（不可达） | 2823–3015 | 193 |
| 4 | renderCameraScan | 4875–5011 | 137 |
| 5 | runTest | 5892–6020 | 129 |
| 6 | drawOldWomanBody | 2126–2240 | 115 |
| 7 | drawXieFront | 2344–2458 | 115 |
| 8 | drawCorridor | 4549–4656 | 108 |
| 9 | frame | 5505–5612 | 108 |
| 10 | setCamera | 3620–3726 | 107 |

函数声明体量分布：≤20 行 138 个、21–50 行 49 个、51–100 行 14 个、101–200 行 10 个、>200 行 2 个。

建议：
- `drawCameraPixelScene` 拆成 room、table、door、bulb、oldWoman 和 post 几部分。其中 room、table、door、bulb 是静态的，可以像三人称一样烘焙成层，每帧只画老妇和后期效果，渲染性能也会随之提升。
- `frame()` 拆成 `updateInput(dt)`、`updateWorld(dt)`、`renderThirdPerson()`、`renderCamera()`、`renderReview()`。
- 3 个 scan 渲染器共享约 15 行相同的前置和后置代码（`camLow` 清空、drawCameraPixelScene、2× 放大、冷色罩、OSD、扫描线），可以抽成 `renderScanBase(ctx,t,crop)`。

### C4 [P2] 魔法数字、重复与命名

- **世界坐标硬编码**：`state.wx=…;state.wy=…` 字面量出现 30 次，其中 `9.9,3.6` 出现 9 次、`9.65,5.1` 出现 8 次，几乎全在调试和测试代码里。`iso(字面量)` 调用 84 次，涉及 45 组坐标；老妇 `iso(8.5,2.5)` 出现 4 次（983、1604、2069、2243 行），但已有常量 `OLD`（3611 行）却没用上。蜡烛 `iso(7.15,4.95)` 出现 3 次，另有 `7.15,4.82`（807 行）。
  顶灯像素坐标 `288,82` 出现 6 次，`292,94` 出现 4 次，在 LightRig（1764 行）与辉光（999 行）、`drawCandleBloom` 中各写一遍，挪动灯位需要改 4 个地方。
  建议建立 `const WORLD={oldWoman:{x:8.5,y:2.5}, candle:{x:7.15,y:4.95}, door:{x:2.0,y:0.6}, bulbPx:{x:288,y:82}, spots:{nearWoman:[9.9,3.6], ritual:[9.65,5.1]}}`。
- **Bayer 矩阵重复 3 份**：`BAYER4` 660 行、LightRig 1710 行、`ditherImage` 3976 行。
- **三套调色板并存**：`C`（235 行，含 23 色，**未被使用**，grep 确认全文 0 处 `C.xxx` 引用）、`PAL`（636 行，约 100 色）、相机局部 `P`（4115 行）。另有内联色值 `'#d84a38'`、`'#e8dfc8'`、`'#8d8574'` 出现 24 次，`rgba(210,240,232|170,225,212|216,201,168` 出现 20 次，它们与 CSS 变量 `--red-bright`、`--bone`、`--dim` 是同一组色，应该统一成一个 `UI` 色板。
- **错误处理**：34 个 `try{`，其中 26 个 `catch(e){}` 是空的，全部吞掉了异常，没有任何日志，问题排查只能靠猜（R1 就是这类问题的典型后果）。建议加一个 `const swallow=(tag)=>(e)=>DEV&&console.warn(tag,e)`。
- **注释**：共 528 行注释，质量不错，有意图说明。但中英混杂（13 行中文注释，其余英文），另有 324–327 行写着“MiniMax 占位、不是《祭》专属素材”这类过时说明，建议统一更新。
- **命名**：`r()`（562 行）这样的单字母全局绘制函数，与 `renderCameraScan` 中的局部 `const r=state.ritual`（4876 行）同名遮蔽，容易误改。建议改名为 `px()` 或 `fillPx()`。

### C5 [P1] 模块化方案（保持 file:// 兼容，不用 ES Modules） · L（分两期）

**第一期（零语义改动，约 1 天）：物理拆分，构建时拼接。** 当前所有函数共享同一个 IIFE 闭包，直接按区段剪成多个文件，构建时按顺序拼回 IIFE，运行时语义完全不变。

```
src/
  00_prelude.js        // (() => { 'use strict';  + 常量、canvas 获取
  10_media_video.js    // 1–191 视频层 + RetroZone 接入
  15_audio.js          // 261–559
  20_draw_helpers.js   // 561–772 绘制原语、抖动、iso
  30_room_layers.js    // 773–1698 房间与烘焙层
  31_lightrig.js       // 1699–1857
  32_props_sprites.js  // 1858–2581 桌、老妇、Xie
  40_camera_render.js  // 3147–3245, 3964–4405, 4875–5297
  50_ui_flow.js        // 3247–3963
  60_chapters.js       // 4407–4874
  70_endings_input.js  // 5298–5501
  80_loop.js           // 5502–5613
  90_shell.js          // 5615–5815 标题、暂停、名单
  99_epilogue.js       // window.__jiThird = …; })();
dev/
  debug_params.js      // 5816–5890, 6021–6146（仅开发构建）
  selftest.js          // runTest
tools/build.js         // 30 行 node 脚本：按文件名排序 cat → game.js；--release 跳过 dev/*
```
```js
// tools/build.js
const fs=require('fs'), path=require('path');
const rel=process.argv.includes('--release');
const parts=fs.readdirSync('src').sort().map(f=>fs.readFileSync(path.join('src',f),'utf8'));
if(!rel) parts.splice(parts.length-1,0,...['dev/debug_params.js','dev/selftest.js'].map(f=>fs.readFileSync(f,'utf8')));
fs.writeFileSync(rel?'dist/game.js':'game.js', parts.join('\n'));
```
index.html 仍然只用一个 `<script src="game.js">`，file:// 照常可用。`node --check game.js` 和现有的 46 条自测可以直接用来验证拆分没有改动行为。

**第二期（按需）：命名空间化。** 每个文件写成 `window.JI = window.JI || {}; JI.audio = (()=>{ …; return {playMedia, playCue, …}; })();`，跨模块只通过 `JI.x` 访问，之后可以在开发时直接用多个经典 `<script>` 标签加载，不再依赖构建。迁移顺序：draw_helpers → audio → lightrig → camera_render，这些模块和 state 耦合最少。

---

## 3. index.html / style.css

| # | 严重度 | 证据 | 问题与修复 | 工作量 |
|---|---|---|---|---|
| H1 | **P1** | `game.js:5420` | 只要 `state.started && !state.ended`，Tab 就被 preventDefault，用来开关记录面板，所以**暂停菜单的 6 个按钮无法用键盘遍历**，只能靠 Esc 和 M。另外 5440 行对 Space 一律 preventDefault 并调用 `commitRitual()`，焦点停在按钮上时按 Space 不会触发按钮（Enter 可以）。修复：当 `e.target.closest('button,[role=dialog]')` 或 `state.paused` 为真时直接 return，让浏览器默认行为生效；记录面板改用 `C` 键，或只在 `!state.paused` 时响应 Tab。 | S |
| H2 | P2 | index.html 有 20 个 `<button>`，带 `type="button"` 的为 0 个；`aria-*`/`role` 仅 1 处（dvVideo） | 每个按钮加 `type="button"`。`#pause`、`#case`、`#credits`、`#end` 加上 `role="dialog" aria-modal="true" aria-labelledby`，打开时 `focus()` 首个按钮，关闭时归还焦点，并在弹层内做焦点循环。`#subtitle` 和 `#prompt` 加 `aria-live="polite"`。两个 canvas 加 `role="img" aria-label="…"`。`#dvVideo` 是解码源，`aria-hidden` 应保持 `true`，不要在 71 行改成 false。 | M |
| H3 | P2 | index.html:5 `maximum-scale=1, user-scalable=no` | 禁止缩放违反 WCAG 1.4.4。桌面端用不到这两个值，建议删除。 | S |
| H4 | P2 | style.css 中字号 8–12 px 的写法共 42 处；`#stage` 按 vw/vh 缩放 | 画面随窗口缩放，HUD 字号却固定。2560×1440 下 9 px 的字小得难以辨认，720p 下又可能挤占画面。修复：`#stage{container-type:size}`，字号改用 `clamp(9px, 1.1cqh, 16px)`（Chrome 105+、Safari 16+），或在 resize 时由 JS 设置 `--u: stageHeight/100`，再用 `font-size:calc(var(--u)*1.1)`。 | M |
| H5 | P2 | `#controls` 颜色为 `rgba(216,201,168,.36)`（184 行）叠在近黑背景上 | 对比度约 2.3:1，低于 AA 的 4.5:1。提示类文字的 alpha 应至少调到 .62。 | S |
| H6 | P2 | 字体栈：JS 有 30 处 `"Courier New",monospace`，6 处 `"PingFang SC",sans-serif`，3 处 `"Songti SC","STSong",serif`；CSS 只有 1 处带 `"Microsoft YaHei"`，1 处带 `"SimSun"` | Windows 没有 PingFang 和 Songti，会回退到系统默认字体：宋体标题变成点阵感很强的 SimSun 或 YaHei，Linux 上可能直接出现缺字方块。另外 `"Courier New",monospace` 遇到中文时完全取决于浏览器的 CJK 回退。修复：建立统一的字体栈常量，CSS 用变量，canvas 复用同一字符串：`--sans:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif; --serif:"Songti SC","STSong","SimSun","Noto Serif CJK SC","Source Han Serif SC",serif; --mono:"Courier New","Menlo","Consolas",var(--sans)`。 | S |
| H7 | P2 | style.css:40、42 | `#stage.shader …` 规则是死 CSS（JS 从不添加 `shader` 类），而 `#crt{display:none}` 让 CSS 扫描线**永远不显示**。所以 `?noshader=1`、WebGL 不可用或 R1 崩溃后，像素 DV 完全没有 CRT 效果。修复：默认显示 #crt，由 JS 在 RetroZone 正常运行时给 #stage 加 `shader` 类。 | S |
| H8 | P2 | z-index 层级 | 现状：pixel 1、dvVideo 0、dvVideoCanvas 2、camera 3、RetroZone 3（在 body 上）、dvCrt 4、vignette 7、crt 8、HUD 10–18、fade 25、screen 30。数值分散在 16 处。建议集中定义成 `--z-*` 变量，并修复 R2 中覆盖层挂错容器的问题。 | S |
| H9 | P2 | `prefers-reduced-motion` | JS（5794 行）会默认开启 flashSafe，CSS（386 行）只停了 dvCrt 动画，这是好的。但 RetroZone 的 `FLICKER_STRENGTH` 和 `NOISE`、`drawReview` 的跟踪带、`frame()` 的 glitch 撕裂（5597 行，已受 flashSafe 门控）中，只有最后一个受控。建议 flashSafe 时调用 `retroDisplay` 把 flicker 设为 0（需要给 vendor 加 uniform）。 | S |
| H10 | P2 | 无 CSP、无 preload | 离线 file:// 下 CSP 的 `'self'` 语义不稳定，不建议加到离线包。itch 网页版可以加 `default-src 'self'; img-src 'self' data:; media-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`（需要先把 5858、5870 行的 `style.cssText` 调试代码剔除）。`og:image` 是相对路径（12 行），OG 抓取器要求绝对 URL。favicon.svg 已存在，没问题。19 处 `innerHTML` 都是静态字符串，没有注入面，可以接受。 | S |

---

## 4. 资源管线

### A1 [P1] 运行时包体积可降约 57% · S–M

运行时实际引用的资源（`dist/ji-she-in-frame-v2.4/assets`，14.18 MB，其中 100% 被引用）：

| 文件 | 现状 | 建议 | 试压结果（`/tmp/ji_audit_r/enc/`） | 节省 |
|---|---|---|---|---|
| music_eerie_bed_90s.mp3 | 3.60 MB，320 kbps / 48 kHz，最终以 0.085 音量播放 | 128 kbps | 1.44 MB | **−2.16 MB** |
| window_rain.wav | 2.30 MB，PCM 48 kHz 立体声，12 s 循环，音量 0.055 | 单声道 32 kHz WAV（保持无缝）/ 或 96 kbps 编码后 base64 内嵌 + WebAudio 循环 | 0.77 MB / 0.145 MB | −1.54 / −2.16 MB |
| bulb_hum.wav | 1.15 MB，6 s 嗡声，音量 0.03 | 单声道 22 kHz WAV / 或 64 kbps 单声道编码后内嵌 | 0.265 MB / 0.048 MB | −0.89 / −1.10 MB |
| ji_keyart_v1.jpg | 1.25 MB，2752×1536，只用作标题页 CSS 背景（style.css:281）和 og:image | 1920 px，q≈80 | 0.133 MB | **−1.12 MB** |
| footage_clip_5s.mp4 | 1.35 MB，1344×768，2 Mbps，**带一条无用的 AAC 音轨**（视频始终 muted），**moov 在文件尾** | 裁成 4:3（同时解决 R5）、960 宽、CRF 26、`-an -movflags +faststart` | 0.45 MB | −0.90 MB |
| music_cue_60s.mp3 | 1.44 MB，192 kbps | 128 kbps | 0.96 MB | −0.48 MB |
| ambience_45s.mp3 | 1.08 MB，192 kbps | 128 kbps | 0.72 MB | −0.36 MB |
| poster_data.js | 273 KB，即 1344×768 JPEG 的 base64，最终只按 640×480 绘制 | 640 宽、q≈75 | 28.5 KB（base64 后） | −0.24 MB |
| ji_clip_v1_poster.jpg | 205 KB，用于 `<video poster>` 属性 | 同上 | 21 KB | −0.18 MB |
| ji_oldwoman_face_v2_480.png | 180 KB | 改为 JPEG data URI（同时解决 R1） | 32 KB | −0.15 MB |
| **合计** | **14.18 MB** | | | **约 −8.0 MB，降到约 6.2 MB** |

说明：
- RELEASE_CHECKLIST 写的是“WAV → MP3”，但雨声和灯泡嗡声仍是 WAV，推测是为了避免 MP3 循环接缝。上表的单声道 WAV 方案在保持无缝的前提下仍能省 2.4 MB。WebAudio 内嵌方案省得更多，但需要改 `getMedia`，让 `bulb`、`rain` 走 AudioBuffer。
- moov 在文件尾对 file:// 基本没有影响，但 itch 网页版走 HTTP 时需要先请求文件尾部才能开始播放。
- 低音量的环境层（0.03–0.055 增益）用单声道和较低采样率，听感上基本分辨不出。

### A2 [P2] 仓库卫生

- `assets/` 中有 54.07 MB **没有被任何运行时代码引用**，共 39.89 MB。主要是 PNG 原图（keyart 6.57 MB、references/v2 三张合计 12.8 MB、model_sheet 3.96 MB、iso_room_ref 1.04 MB、clip_poster.png 1.26 MB）、`audio/source/` 下的 20 个 WAV 和 MP3 源文件（约 13.9 MB，其中 ambience_loop.mp3 3.93 MB）以及 `ji_iso_eerie_v2_480.png`（184 KB，已无引用）。
- 另外 `shots/` 40 MB、`store/` 12 MB、`dist/` 26 MB（展开目录和 zip 内容重复）、`dev/archive/game.js.orig` 151 KB。
- 建议：把源素材移到 `source_assets/`（或 Git LFS / 外部网盘），`dist/`、`shots/` 加进 ignore。打包脚本改为**按引用清单复制**，而不是复制整个目录。可以复用本报告的引用扫描逻辑：遍历 assets，检查文件名是否出现在 game.js、index.html、style.css 中，未出现的不打包。dist 的 zip 已经是这样筛选的，说明当前打包是手工完成的，容易出错。

---

## 5. 建议执行顺序

1. **发布前（约 1 天）**
   - R1：脸图改 data URI，vendor 加 try/catch 和 onError 回退。
   - R2：隐藏时不跑 render，用 ResizeObserver 代替每帧测量，覆盖层乘 DPR。
   - R5：视频和 poster 做 cover 裁切。
   - R6：blur 和 visibilitychange 时暂停并释放按键。
   - H1：暂停时不劫持 Tab 和 Space。
   - H7：#crt 回退。
   - A1：重编码音视频和图片，−8 MB。
   - 补自测断言：#camera 不被污染；进入 look 后 RetroZone 帧计数仍在增长。
2. **下一个迭代**
   - R3、R4：LightRig 预计算加按时间节流；DV 期间跳过三人称绘制。
   - R7：计时器注册表与游戏时钟；暂停时 `actx.suspend()`。
   - R8：上下文丢失处理。
   - C1：删除 665 行不可达代码，测试和调试代码移出生产包。
   - C5 第一期：拆文件加 concat 构建。
3. **长期**
   - C2：状态工厂和分域。
   - C3：拆分大函数，相机场景改为烘焙层。
   - H2、H4：可访问性与 HUD 缩放。
   - R12：WebAudio 统一增益（为 iOS 做准备）。

## 附录：复现与脚本

- 函数体量与死代码：`node /tmp/ji_audit_r/analyze.js`、`node /tmp/ji_audit_r/reach.js [notest]`
- 计时器统计：`node /tmp/ji_audit_r/timers.js`
- 运行时测量：先启动带 `--remote-debugging-port=9333` 的 headless Chrome，再运行 `node /tmp/ji_audit_r/cdp.js "<query>" <idle|camera|shots|review|reviewlook>`。结果在 `/tmp/ji_audit_r/run_*.json`，截图为 `shot_cam_*.png`。
- LightRig 基准：`node /tmp/ji_audit_r/lightbench.js`
