# Codex 评估与测试提示语（v2.10.2）

把下面 `---` 之间的整段内容粘给 Codex（工作目录设为仓库根）。它自带基线、约束、
测试分层和报告模板，不需要你再补充上下文。

---

你是我的**外部评审 + 测试工程师**。项目是《祭：她在画面里 / She Is in the Frame》，
一个 HTML5 Canvas 2D 的 found-footage 心理恐怖 vertical slice，目标是把完成度推到
**可以上架 itch.io** 的水平。我现在要的不是夸奖，是**能变成 diff 的问题清单**：
能复现的 bug、能被玩家感知的设计缺陷、会让商店审核或首次玩家困惑的地方。

## 0. 项目事实

- 仓库：`~/Documents/ji-she-in-frame`（当前分支 `feat/s1-ritual-required`，版本见 `VERSION`，现为 `2.10.2`）
- 运行时：**零依赖、零构建**。`index.html` + `style.css` + `game.js`（单文件约 7800 行）+ `vendor/retrozone-shader.js` + `assets/`。
  直接 `file://` 打开即可跑，没有 npm install、没有打包器、没有服务端。
- 内容：5 遍循环（供桌仪轨 → 找她 ×4 → 拍三处异常 → 躲她 ×4 → 拍她）+ 走廊 DV 段 + 第二幕暗房（三处红灯显影 / 接带 / 洗印）。
- 三个结局：`help`、`film`、`bad`。真实按键 e2e 三个都能打到。
- 首次游玩时长：100 局零知识模拟中位 **9:38**（p10 8:53 / p90 10:42）。**目标是 10–15 分钟**，目前偏短，这是已知待解决项。
- 音频：34 个文件 / 26 个 cue，WebAudio，`?audiodbg=1` 自检。
- 入口参数（调试用，都是 `index.html?…`）：`nointro test audiodbg lumtest uitest advance rec mobile`
  `chapter ritual huntpos uncanny mismatch rdone review case clue scan photo eyes figure hand near pos pose bad end take2 split corridor depth look act2 trailer sim naive clean nofx noui novideo vfreeze vposter videodbg noglitch mobile=force|off`
  需要某个场景的图，优先用这些参数直达，**不要**从头玩 10 分钟去截图。

## 1. 硬约束（违反即作废）

1. **先只读**。第一轮不要改任何文件。等我确认报告后，才允许按"最小 diff"修 bug。
2. **不许动**：`playtest/` 的密码逻辑与 `dev/.beta_pass`、`dist/` 里的 zip、`VERSION` 版本号、`assets/` 里的美术与音频源文件。
3. **不许** `git push`、部署、开 PR、改 gh-pages、联网上传任何东西。只在本地。
4. 不引入任何第三方依赖（包括 npm 包、CDN 脚本、字体）。这游戏必须能离线双击运行。
5. 不重构、不格式化、不改代码风格、不改中文文案（发现文案问题**报告**，别自己改写）。
6. 每一条修改都必须让 `./dev/verify.sh` 保持全绿；不许为了让测试通过而改测试预期。
7. 发现 bug 先写**复现步骤**（参数、按键序列、期望/实际），再谈修法。
8. 不确定是不是 bug 的，标 `SUSPECT`，不要假装确定。

## 2. 阶段 0 · 基线（必须先跑，10 分钟）

```bash
cd ~/Documents/ji-she-in-frame
node --check game.js
./dev/verify.sh
```

预期全绿，且**数量级**如下（对不上就是你自己弄坏或环境问题，先查环境）：

```
TEST PASS 72/72          # 自测
AUDIO PASS               # 34/34
LUM PASS 23/23           # 可读性
UI PASS × 6              # 800x337 / 1024x625 / 1280x577 / 1366x625 / 1920x937 / 2560x1297
E2E PASS help / film / bad   # 真实按键，含逐章链路断言
GATE PASS 15/15          # 内测加密
AUDIT PASS 77/77         # 发布审计
TEST PASS 72/72          # 解包后的 zip 自检
```

需要的工具：Chrome（`/Applications/Google Chrome.app`）、`node`、`unzip`、`rg`、`ffmpeg/ffprobe`。
**所有无头测试的 Chrome 参数照 `dev/verify.sh` 抄**（`--headless=new --enable-unsafe-swiftshader
--allow-file-access-from-files --virtual-time-budget=…`），不要自己发明一套。
如果 `verify.sh` 已经红了，**先报告是哪一条红、输出是什么，不要动手修**。

## 3. 阶段 1 · 自动门之外，我真正想被攻击的地方

按"最可能藏 bug"排序，逐个场景实测（用调试参数直达 + 真实按键）：

**A. 状态机与章节边界**
- 五个章节之间来回切换时，HUD / 计分 / 提示 / 输入锁有没有残留？重复进入同一章会怎样？
- `state.mile` 是只增不减的里程碑；有没有哪条路径能让玩家**绕过**某一遍（例如某次交互同时触发两个条件）？
- 暂停 / 记录板（Tab）/ 回看（R）/ 名单 / 结局卡，两两叠加时键盘事件归谁？在 `state.transition` 期间按 R 或 Tab 会不会撕裂画面？
- 暗房接带：`Q/E` 移动 + `空格` 接带，接错会"弹带重来"。反复接错 20 次会不会卡死、会不会让偏移量漂到不可解？`?act2=splice / aligned / split / back` 可直达。

**B. 结局可达性与一致性**
- 三个结局的**触发条件是否唯一**？有没有第四条路径落到某个结局卡但内部状态不匹配？
- `bad` 需要 `ritualLoops>=3`；玩家如果一直摆错但从不看旧带，会得到什么？
- 结局卡上的文案与玩家实际做过的事是否一致（尤其 film：玩家是否真的一直在拍）？

**C. 存档 / 刷新 / 中断**
- 没有任何持久化（这是设计决定）——但刷新页面、切标签页、窗口失焦后音频上下文会怎样？切回来有没有静音但 UI 显示"声音 开"？
- 录音器（`?rec=1`）与游戏同时存在时，暂停、切页、结束会不会丢事件？

**D. 冷启动与低配**
- 清空缓存后首帧：字体未就绪时中文有没有闪跳、canvas 有没有闪黑？
- `assets/video/*.mp4` 在 `file://` 下 decode 失败时回退路径是否真的生效（用 `?novideo=1` 与 `?vposter=1` 对比）？
- 把窗口从 2560 拖到 800、再拉回，`--u` 缩放有没有残留（字幕错位、HUD 重叠）？

**E. 输入边界**
- 只用键盘能否从标题走到任一结局、再回到标题？（鼠标一次不点）
- `Tab` 是游戏内记录板，也是浏览器焦点切换：在哪些状态下会漏给浏览器？
- 输入法（中文输入法激活）状态按 WASD/E 会怎样？
- 大写锁定 / 非 QWERTY 布局 / 数字小键盘 Enter？

**F. 实际可玩性（这条最重要，别只测代码）**
以"完全没看过任何说明的玩家"身份，**真的从头玩一遍到结局**，记录：
- 每一步你**不确定该干什么**的时刻（时间点 + 当时屏幕上的提示 + 你猜了什么）；
- 你**卡住超过 30 秒**的地方；
- 你觉得"这在骗我"或"这明显是 bug"的地方（区分真 bug 与设计意图）；
- 节奏：哪一段无聊、哪一段太快、哪个音效重复到出戏；
- 恐怖是否成立：哪一刻真的不舒服，哪一刻只是嘈杂。
这一节用第一人称写，不要写成测试报告。

## 4. 阶段 2 · 静态审计（读代码找，不跑）

`game.js` 单文件，重点看：

- **未被清理的定时器 / 监听器**：`later()`, `setInterval`, `addEventListener` 在章节切换、重开、结局后是否泄漏。
- **静默失败**：`playMedia()` 对未知 cue 是静默 return；`try/catch` 吞掉异常却不留痕。列出所有"出错也不会有人知道"的位置。
- **数值契约**：电量、偏移量、深度、轮次等是否有上下界保护；除以 0、NaN 传播的可能。
- **画布尺寸硬编码**：`PX/PH`、1280×960 的 camera canvas、`--u` 倍率之间是否有地方写死了 px。
- **重复实现**：同一段逻辑在 room / corridor / darkroom 各写一遍，改一处会漏另一处的地方。
- **死代码 / 不可达分支**：`?act2=` 等调试分支里有没有已经和主线脱节的。
- **注释与代码不一致**：注释说"会把 X 置真"但实际没有（这类在改版后最容易骗人）。

每条给出 `文件:行号` + 为什么是问题 + 触发条件。

## 5. 阶段 3 · 兼容性与无障碍

- Chrome / Safari / Firefox 各跑一次标题页 + 第一遍（Safari 用 `safaridriver` 或直接人工描述都不算通过；没有就标 `UNTESTED`）。
- `file://` 与 `http://localhost` 两种打开方式有差异吗（视频 taint、WebGL、字体）？
- 强制 200% 浏览器缩放、Windows 高对比度、`prefers-reduced-motion: reduce`（游戏里有闪烁开关，它真的生效吗）？
- 只有键盘、不用鼠标、单声道 / 静音三类玩家的完整体验。
- 屏幕阅读器：标题页、暂停、结局卡的按钮有可读名称吗？（canvas 游戏不要求可玩，但 UI 层应该可操作。）

## 6. 阶段 4 · 上架材料

- `store/itch_metadata.md`、`store/itch_description.html`、`store/README.md`、`README.md`、`TRIAL_PLAY.md`、`RELEASE_CHECKLIST.md` 之间有没有**互相矛盾**的说法（时长、遍数、有无第二幕、是否需要键盘、内容警告）。
- 商店截图是否**每张都值得放**：有没有哪张看不出在玩什么、或暴露了 bug（黑屏、文字截断、调试信息）。逐张给"留 / 换 / 删"。
- `store/trailer_26s.mp4`：前 3 秒能看懂是什么游戏吗？有无黑帧、抖动、音画不同步？
- 合规：`RIGHTS.md` / `CREDITS.md` 是否覆盖了所有实际使用的素材（包括脚本内联的数据、字体、着色器）。AI 生成资产的标注是否足以应付 itch 的披露要求。

## 7. 报告格式（严格照这个写）

```
# 评估报告 · v2.10.2

## 一句话结论
（能不能上架；如果不能，缺的是哪一类东西）

## 基线
verify.sh 结果：…（全绿 / 哪条红 + 输出）

## P0 · 阻断上架（必须修）
1. [标题] — 文件:行号
   - 复现：参数 / 按键序列 / 窗口尺寸
   - 期望 / 实际
   - 影响：谁会遇到、多大概率
   - 建议修法（一句话，不要直接改）

## P1 · 明显影响体验
（同上格式）

## P2 · 打磨项
（表格：问题 | 位置 | 一处说明）

## 设计评估（第一人称试玩）
- 卡点（时间 + 当时提示 + 我的猜测）
- 节奏
- 恐怖是否成立
- 我作为玩家最想改的三件事

## 上架材料
（截图逐张判断 + 文档矛盾清单）

## 我确认不是问题的（避免我重复劳动）
## 我没测到的 / 环境限制（UNTESTED）
```

字数不设上限，但**每一条都必须可验证**。宁可 10 条扎实的，不要 60 条"建议优化"。

## 8. 已知，不用报

- `HANDOVER.md` / `HANDOVER_FINAL.md` / `EVALUATION_HANDOVER.md` 正文是 v2.8 的历史快照，顶部已标 `HISTORICAL`；里面"85 秒 / 不建议上架"是过去时。
- DV 素材是**程序化占位**，正式版换实拍；CREDITS 已声明。
- 手机会先看到"需要键盘"的说明页，这是有意为之（无触屏适配）。
- `dev/sim/REPORT.md` 第 1 节的 99 秒机器人速度是历史数据，已划掉；第 2 节 9:38 才是现行基准。
- 无存档、无设置持久化、无多语言：都是有意的 vertical slice 范围。
- 音频是 2026-10-22 重新交付、已做增益匹配；主观音质问题可以提，但"音量不一致"需要给出具体 cue。

## 9. 最后

跑完先给我**报告**，不要顺手改代码。如果期间你发现某条修复很小且显然（比如一个 off-by-one），
可以写在"建议修法"里附 diff 片段，但**不要写进文件**，等我点头。

---

## 附：常用直达命令（省时间）

```bash
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
F="--headless=new --no-sandbox --enable-unsafe-swiftshader --use-angle=swiftshader --ignore-gpu-blocklist --allow-file-access-from-files --disable-web-security --mute-audio --hide-scrollbars"

# 自测 / 音频 / 可读性 / 版式
"$C" $F --virtual-time-budget=120000 --dump-dom "file://$PWD/index.html?nointro=1&test=1"     | rg -o '<title>[^<]+</title>'
"$C" $F --virtual-time-budget=45000  --dump-dom "file://$PWD/index.html?nointro=1&novideo=1&audiodbg=1" | rg -o '<title>[^<]+</title>'
"$C" $F --virtual-time-budget=60000  --dump-dom "file://$PWD/index.html?nointro=1&lumtest=1&advance=6"  | rg -o '<title>[^<]+</title>'
"$C" $F --window-size=1366,768 --virtual-time-budget=60000 --dump-dom "file://$PWD/index.html?nointro=1&uitest=1" | rg -o '<title>[^<]+</title>'

# 直达场景截图（换成你要的地方）
"$C" $F --window-size=1280,720 --virtual-time-budget=12000 --screenshot=/tmp/a.png "file://$PWD/index.html?nointro=1&act2=bench&advance=5"
"$C" $F --window-size=1280,720 --virtual-time-budget=12000 --screenshot=/tmp/b.png "file://$PWD/index.html?nointro=1&corridor=1&depth=0.56&look=1&advance=6"
"$C" $F --window-size=1280,720 --virtual-time-budget=12000 --screenshot=/tmp/c.png "file://$PWD/index.html?nointro=1&chapter=4&huntpos=1&advance=9"
"$C" $F --window-size=1280,720 --virtual-time-budget=12000 --screenshot=/tmp/d.png "file://$PWD/index.html?nointro=1&review=1&pos=0.55"
"$C" $F --window-size=1280,720 --virtual-time-budget=12000 --screenshot=/tmp/d2.png "file://$PWD/index.html?nointro=1&ritual=1&rtarget=1"
"$C" $F --window-size=1280,720 --virtual-time-budget=12000 --screenshot=/tmp/e.png "file://$PWD/index.html?mobile=force"

# 结局（真实按键，不写 state）
./dev/e2e/run.sh help
./dev/e2e/run.sh film
./dev/e2e/run.sh bad

# 发布包 / 审计 / 解包冒烟
./dev/package.sh && node dev/release_audit.mjs
```
