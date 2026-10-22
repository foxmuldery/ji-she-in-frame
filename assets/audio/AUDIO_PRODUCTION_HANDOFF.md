# 《祭：她在画面里》音频制作交接清单

> **2026-10-22 更新**：MiniMax Design 重新交付了其中 28 个文件（192 kbps MP3 / 48 kHz WAV，
> 见 [`AUDIO_ASSET_DELIVERY_REPORT.md`](AUDIO_ASSET_DELIVERY_REPORT.md)）。新母带刻意留了
> 3–17 dB 余量，因此接入时按文件逐个补了增益（`dev/audio/delivery_gains.tsv`），
> 让峰值回到本表调音时的电平；`dev/audio/integrate_delivery.sh` 可复现。
> 下表 34 个 key 不变；标注 TTS 2026-10-21 的 6 个（voicePhone / ritual_ok /
> anomaly_snap / hide_fail / hide_lure / phone_ring）不在本次交付内，仍是 128 kbps。

> **用途**：交给音效 / 音乐 / 配音同事，用于替换当前 AI 占位素材或正式重制。  
> **工程版本**：`feat/s1-ritual-required`（在 v2.8.0 上）；运行时 **34** 个本地音频 + WebAudio 程序化补充。  
> **现有记录**：`PROMPTS.md`（已生成英文 prompt 原文）、`SOUND_MANIFEST.json`（2026-10-19 批次计量）、`assets/prompts/*.txt`（部分音乐/SFX 初稿）。  
> **交付路径**：`assets/audio/<文件名>`，与 `game.js` 内 `AUDIO_FILES` 键名一致；替换后跑 `./dev/verify.sh`（`AUDIO PASS`）。

---

## 1. 声音圣经（Sound Bible）

### 1.1 空间与时代

- **地点**：中国南方农村老屋香堂 / 曾家村，2003 年 8 月雨季夜晚。  
- **听感**：潮湿、冷、闷；不是现代恐怖片「大混响」，而是 **小房间 + 廉价 DV 机内麦**。  
- **叙事层**：found-footage — 玩家有时是「徐英子 DV 里的世界」，有时是「第三人称重建」；音乐与 stinger 应像 **带子上的事故**，而不是游戏 BGM。  
- **参考气质**：P.T. 式耐心、国产志怪片香堂、模拟恐怖录像带（wow/flutter、轻微底噪），**不要 jump scare 管弦乐**。

### 1.2 分层结构（引擎内）

| 层 | 素材 | 行为 |
| --- | --- | --- |
| **环境床** | `ambience_45s` + `window_rain` + `bulb_hum` | 点击「开始」后循环淡入（约 1.8s）；`rain`/`bulb` 必须 **无缝循环** |
| **探索音乐床** | `music_eerie_bed_90s` | 循环，音量很低（约 8.5%），压在环境之下 |
| **程序化细节** | `clock` / `water` / `door` / `chair` / `steps` / `incense` / `oldBreath` | 按玩家位置与计时器随机触发 one-shot |
| **复合 Cue** | 见 §4 | 多轨同时淡入（首次举 DV、回头、错手、回看空白、两结局） |
| **语音** | `voice_*` + 大量 **仅字幕** 的老妇台词 | **5** 句有独立配音（含走廊 `voicePhone`）；其余见 `PROMPTS_SOUND_ONLY.md` |
| **程序化合成** | `tone()` / `noise()` | 快门补充、电话铃、部分 scare 低频；正式版可保留或并入 `shutter.mp3` |

### 1.3 技术规格（建议正式版）

| 类型 | 格式 | 采样率 | 声道 | 响度建议 |
| --- | --- | --- | --- | --- |
| 循环环境 | WAV（无缝）或高质量 MP3 | 48 kHz | 立体声 | 峰值 −12～−18 dBFS，RMS 约 −26～−32 |
| One-shot SFX | WAV 母带 → 128 kbps MP3 发行 | 48 kHz | 立体声 | 峰值 −3～−9 dBFS；引擎会再乘 0.2～0.95 |
| 音乐床 | MP3 320k 或 WAV | 48 kHz | 立体声 | 峰值约 −1.5～−3 dBFS，留 headroom |
| 老妇 VO | WAV 母带 → MP3 | 48 kHz | **单声道** | 峰值 −3 dBFS；近讲、干燥、少混响 |

---

## 2. 总表：34 个运行时文件

| # | 引擎键名 | 运行时文件 | 类型 | 循环 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | ambience | ambience_45s.mp3 | 环境床 | 是 | AI 占位 |
| 2 | rain | window_rain.wav | 环境 | 是 | AI + 无缝处理 |
| 3 | bulb | bulb_hum.wav | 环境 | 是 | AI + 无缝处理 |
| 4 | musicBed | music_eerie_bed_90s.mp3 | 音乐 | 是 | AI 占位 |
| 5 | uncannySwell | music_cue_60s.mp3 | 音乐 cue | 否* | AI 占位 |
| 6 | clock | clock_tick.mp3 | SFX | 否 | AI |
| 7 | water | water_drip.mp3 | SFX | 否 | AI |
| 8 | door | door_creak.mp3 | SFX | 否 | AI |
| 9 | steps | wet_steps.mp3 | SFX | 否 | AI |
| 10 | chair | chair_scrape.mp3 | SFX | 否 | AI |
| 11 | incense | incense_whisper.mp3 | SFX | 否 | AI |
| 12 | oldBreath | oldwoman_breath.mp3 | SFX | 否 | AI |
| 13 | revealImpact | reveal_impact.mp3 | SFX | 否 | AI（初版 prompt 见 §3.13） |
| 14 | breath | breath.mp3 | SFX | 否 | AI |
| 15 | moan | moan.mp3 | SFX | 否 | AI（初版 prompt 见 §3.15） |
| 16 | squelch | squelch.mp3 | SFX | 否 | AI |
| 17 | collapse | collapse.mp3 | SFX | 否 | AI（初版 prompt 见 §3.17） |
| 18 | collapse2 | collapse2.mp3 | SFX | 否 | AI |
| 19 | scream | scream.mp3 | SFX | 否 | AI |
| 20 | shriek | shriek.mp3 | SFX | 否 | AI（初版 prompt 见 §3.20） |
| 21 | voiceOpen | voice_open.mp3 | VO | 否 | TTS |
| 22 | voiceHand | voice_hand.mp3 | VO | 否 | TTS |
| 23 | voiceWhat | voice_what.mp3 | VO | 否 | TTS |
| 24 | voiceTurn | voice_turn.mp3 | VO | 否 | TTS |
| 25 | shutter | shutter.mp3 | SFX | 否 | AI 2026-10-21 |
| 26 | scanPing | scan_ping.mp3 | SFX | 否 | AI 2026-10-21 |
| 27 | roomShift | room_shift.mp3 | SFX | 否 | AI 2026-10-21 |
| 28 | huntEmpty | hunt_empty.mp3 | SFX | 否 | AI 2026-10-21 |
| 29 | phoneRing | phone_ring.mp3 | SFX | 否 | AI 2026-10-21 |
| 30 | voicePhone | voice_phone.mp3 | VO | 否 | TTS 2026-10-21 |
| 31 | ritualOk | ritual_ok.mp3 | SFX | 否 | AI 2026-10-21 |
| 32 | anomalySnap | anomaly_snap.mp3 | SFX | 否 | AI 2026-10-21 |
| 33 | hideFail | hide_fail.mp3 | SFX | 否 | AI 2026-10-21 |
| 34 | hideLure | hide_lure.mp3 | SFX | 否 | AI 2026-10-21 |

\* `uncannySwell` 在 cue 里只淡入播放一段，文件本身可做成 60s 静态 cue，不必游戏内 loop。

---

## 3. 分轨制作说明 + 英文 Prompt（可直接给 AI / 拟音）

每条包含：**触发**、**时长目标**、**中文意图**、**English production prompt**（富裕版）。

---

### 3.1 `ambience_45s.mp3` — 香堂房间底噪

- **触发**：`startAmbience()`，与雨、灯泡、音乐床同时淡入。  
- **时长**：45 s **无缝循环**。  
- **中文**：闷在香堂里的持续底噪——极低 drone、坏灯管嗡鸣、窗外风压木窗、远处金属轻响、偶发干木 cracking；无旋律无节奏。  
- **Prompt（已有 `assets/prompts/amb_bed_v1.txt`）**：

```text
Dark ambient room-tone bed for a Chinese found-footage horror game, 45 seconds, seamless loop. A very low continuous sub drone, the hum of a failing fluorescent tube, faint wind pressing at wooden shutters, occasional distant metal settling and a single dry wood crack. No melody, no rhythm, no drums, no vocals, no birds. Extremely sparse, static, oppressive and cold. Recorded-room realism, slight tape hiss, mono-compatible.
```

---

### 3.2 `window_rain.wav` — 窗外雨（循环）

- **触发**：环境层循环；音量约 5.5%。  
- **时长**：12 s **无缝循环**（当前用 head overlap-add 处理）。  
- **中文**：从室内听木窗板外的夜雨与低压风，闷、远、无雷。  
- **Prompt（PROMPTS.md 原文）**：

```text
Soft night rain and low wind pressing against a closed wooden shutter, heard from inside a dark room, muffled and low. Steady continuous texture suitable for a seamless loop. No thunder, no voice, no music, no drips, no gutter.
```

---

### 3.3 `bulb_hum.wav` — 琥珀灯泡电流（循环）

- **触发**：环境层循环。  
- **时长**：6 s **无缝循环**。  
- **中文**：单盏裸灯泡 50 Hz 感电流 hum + 灯丝细微噼啪 + 极慢闪烁脉冲。  
- **Prompt（PROMPTS.md 原文）**：

```text
Low electrical mains hum from a single bare incandescent light bulb, steady 50 Hz family drone with faint filament crackle and subtle flicker pulses, a very quiet dark room behind it. Continuous steady texture suitable for a seamless loop. No music, no voice, no clicks, no buzz bursts.
```

---

### 3.4 `music_eerie_bed_90s.mp3` — 探索氛围曲

- **触发**：`musicBed` 循环，音量约 8.5%。  
- **时长**：90 s 可循环或自然结束再无缝接（当前为 90 s 节选）。  
- **中文**：极简民俗恐怖配乐——低音 drone、走音大提琴泛音、约每 20 s 一声远处小铜铃、磁带呼吸噪声；无鼓无旋律 loop。  
- **Prompt（PROMPTS.md 原文）**：

```text
Sparse ritual horror film score for a 16-bit pixel-art Chinese folk-horror shrine, 90 seconds, almost static and patient, funereal, 写意. A very low sub drone that never resolves, one bowed cello harmonic drifting slowly out of tune, a distant small Chinese ritual bell struck once every twenty seconds with long decay, and a breath-like tape hiss texture breathing underneath. Chinese folk instrumentation (erhu/xiao/bell) buried in tape saturation, wow and flutter. No drums, no percussion, no melody loop, no vocals, no choir, no jump-scare stingers. Extremely restrained, cold, humid, ancient. Mono-compatible, analog tape realism.
```

---

### 3.5 `music_cue_60s.mp3` — 复合 cue「uncanny」（键名 uncannySwell）

- **触发**：`playCue('uncanny')` — 她无故回头 / 重建层揭示时，与 `moan` 叠放。  
- **时长**：60 s 素材，实际只淡入前段（volume 0.45）。  
- **中文**：更「音乐化」但仍静态的 60s cue：走音大提琴、二十秒一声呼吸感笛音、长留白、末尾一声仪式铃。  
- **Prompt（`assets/prompts/music_cue_v1.txt`）**：

```text
Sparse cinematic horror music cue, 60 seconds, slow and almost static. A single sustained bowed cello harmonic drifting out of tune, a breathy low bamboo flute note every twenty seconds, long silences between, a faint ritual bell strike at the very end. No drums, no percussion, no vocals, no melody loop. Chinese folk instrumentation processed through tape saturation, funereal, patient, dread without jump-scare. 60 BPM feel, rubato.
```

---

### 3.6 `clock_tick.mp3` — 挂钟一击

- **触发**：每 11 s 环境定时器；回看逐帧时额外轻触发。  
- **时长**：~3 s（含一击 + 余韵）。  
- **Prompt（PROMPTS.md 原文）**：

```text
One single slow dull mechanical clock tick in an absolutely silent room, close to the microphone. A heavy brass-and-wood mantel clock escapement: a soft wooden thunk with a faint metallic tinkle, slightly irregular timing, followed by a tiny gear settle and a dry tick a beat later. No reverb tail, no room tone, no music, no voice, no ticking loop, no clock chime. Dry, intimate, lo-fi, recorded on a cheap camcorder.
```

---

### 3.7 `water_drip.mp3` — 水碗滴水

- **触发**：每 9 s，且仅在 **回看或举 DV** 时；象征水碗里「眼」的滴水。  
- **时长**：~3.6 s。  
- **Prompt（PROMPTS.md 原文）**：

```text
One single slow water drip falling into a shallow glazed ceramic bowl in a quiet stone room, close to the microphone. A soft wet plip with a tiny rising ceramic resonance and a short wet tail, then one smaller secondary droplet settling. No music, no voice, no continuous water, no reverb longer than a second. Intimate, damp, lo-fi, recorded on a cheap camcorder.
```

---

### 3.8 `door_creak.mp3` — 木门轴

- **触发**：靠近门口随机；起仪失败、惊吓、坏结局等多处 `playMedia('door')`。  
- **时长**：~4 s。  
- **Prompt（PROMPTS.md 原文）**：

```text
A long low wooden door creak, an old dry hinge giving way as the door opens just a few inches, close to the microphone. Wood grain grinding and sticking, a low groan with stick-slip judder, then the door settling still. Very dry, no music, no voice, no reverb, no slam, no latch click.
```

---

### 3.9 `wet_steps.mp3` — 湿脚步

- **触发**：玩家靠近走廊/脚印区，≥12 s 冷却。  
- **时长**：~6 s，**六步**由远及近。  
- **Prompt（PROMPTS.md 原文）**：

```text
Six slow wet barefoot steps on cracked concrete, approaching from a distance and ending close to the microphone. Wet soles peeling and slapping the floor, a faint film of water, slight natural echo of a narrow tiled hallway. No voice, no breathing, no music, no thunder. Field recording, lo-fi, slightly muffled.
```

---

### 3.10 `chair_scrape.mp3` — 椅脚刮地

- **触发**：靠近墙边椅子，≥9 s 冷却。  
- **时长**：~2 s，单次刮擦。  
- **Prompt（PROMPTS.md 原文）**：

```text
A single short dry wooden chair leg scraping once across bare concrete, close to the microphone. Abrupt friction rasp with a tiny wood creak, then silence. No music, no voice, no reverb, no impact, no chair fall.
```

---

### 3.11 `incense_whisper.mp3` — 香火气 / 无声息

- **触发**：靠近香炉，≥10 s 冷却；起仪成功时短播。  
- **时长**：~5 s，**偏轻**（峰值约 −9 dBFS）。  
- **Prompt（PROMPTS.md 原文）**：

```text
Five continuous seconds of a dry faint whisper-like hiss of incense smoke drifting close to the microphone, airy and granular, with one soft human breath through the nose and a faint throat click, no words, no voice. Quiet, close, almost subliminal, steady. No music, no reverb, no wind.
```

---

### 3.12 `oldwoman_breath.mp3` — 老妇呼吸

- **触发**：靠近老妇；惊吓、起仪、躲她、显影、走廊等 **高频复用**（建议正式版做 2～3 变体防疲劳）。  
- **时长**：~6 s。  
- **Prompt（PROMPTS.md 原文）**：

```text
An old woman's close, ragged, shallow breathing, slightly wet in the throat, frightened and keeping very still, recorded very close to the microphone. Quiet, uneven, effortful. No voice, no words, no music, no room reverb.
```

---

### 3.13 `reveal_impact.mp3` — 首次举 DV 冲击

- **触发**：`playCue('cameraReveal')` 第一轨，与 `breath` 叠放。  
- **时长**：~1～2 s。  
- **中文**：廉价 DV 开机/进入取景器：磁带伺服、一点数字噪、短低频 thump，不要好莱坞 whoosh。  
- **Prompt（建议正式拟音 / AI）**：

```text
A found-footage camcorder entering record mode: a dry plastic button click, a tiny motor whir, a short burst of tape hiss and a soft low-frequency thump through the onboard microphone, as if the light just came on in a dark shrine room. No music, no voice, no long reverb. Lo-fi, clipped, intimate, 1.5 seconds total.
```

---

### 3.14 `breath.mp3` — 玩家（或拍摄者）喘气

- **触发**：`cameraReveal` 第二轨（volume 0.95）。  
- **时长**：~6 s。  
- **Prompt（`assets/prompts/sfx_breath_v1.txt`）**：

```text
A man breathing heavily and raggedly through his mouth, close microphone, exhausted and frightened, small wet catch in the throat on each inhale, dry room tone behind. No music, no voices. 6 seconds.
```

---

### 3.15 `moan.mp3` — 远处仪式低吟

- **触发**：`playCue('uncanny')` 与 `uncannySwell` 叠放。  
- **时长**：~4～8 s。  
- **中文**：像从墙里渗出的老妇低吟，非清晰语言，带民俗不适感的音高滑移。  
- **Prompt（建议）**：

```text
A distant old woman's low ritual moan heard through a plaster wall in a Chinese village shrine, not quite words, one slow rising-falling pitch with a dry throat rattle, very quiet room behind. No music, no reverb tail longer than one second. Found-footage lo-fi, unsettling but not loud. 5 seconds.
```

---

### 3.16 `squelch.mp3` — 错手 / 肉体黏腻

- **触发**：`playCue('mismatch')` — 抬错手、取景器与第三人称不一致。  
- **时长**：~3 s。  
- **Prompt（`assets/prompts/sfx_squelch_v1.txt`）**：

```text
Wet squelching, tearing and sucking of raw meat and fat being pressed into a wound, extremely close microphone, organic, sticky, unpleasant. No music, no voices, no reverb. Foley recording, 3 seconds.
```

---

### 3.17 `collapse.mp3` — 磁带/结构塌陷（回看空白）

- **触发**：`playCue('reviewGap')` — 进入 23:06 空白段。  
- **时长**：~3～5 s。  
- **中文**：像一盘 DV 带子在空白处「塌下去」：pitch 骤降、模拟失真、短噪声墙后迅速死寂。  
- **Prompt（建议）**：

```text
A VHS or MiniDV tape collapse in a camcorder: a sudden pitch-down warble, a burst of analog tracking noise and a soft structural thud, as if the timeline fell into a hole, then near silence. No music, no voice. 4 seconds, lo-fi, harsh but short.
```

---

### 3.18 `collapse2.mp3` — 结局「你走过去了」

- **触发**：`playCue('endingHelp')` + 坏结局里单独 `playMedia('collapse2')`。  
- **时长**：~4～6 s。  
- **中文**：比 `collapse` 更「落地」的一次结束——像放下摄像机、膝盖着地或木梁微响，带一点哀感而非惊吓。  
- **Prompt（建议）**：

```text
A soft heavy collapse in a wooden shrine room: knees on thin floorboards or a camcorder set down hard, a short wooden flex groan, dust settle, then silence. Emotional rather than jump-scare. No music, no voice. Dry close mic, 5 seconds.
```

---

### 3.19 `scream.mp3` — 男人尖叫（film 结局）

- **触发**：`playCue('endingFilm')` 第一轨。  
- **时长**：~2～4 s，被截断。  
- **Prompt（`assets/prompts/sfx_scream_v1.txt`）**：

```text
A single adult man's raw scream of sudden sharp pain, close to the microphone, throat tearing, cut off abruptly into a wet ragged gasp. Dry concrete room, no music, no words, no reverb tail longer than half a second. Recorded on a cheap camcorder.
```

---

### 3.20 `shriek.mp3` — 高频刺（film 结局第二轨）

- **触发**：`endingFilm` 第二轨（volume 0.18，晚一点淡入）。  
- **时长**：~1～2 s。  
- **中文**：磁带/麦克风过载的高频 feedback 刺，不是女声尖叫。  
- **Prompt（建议）**：

```text
A very short analog tape feedback shriek and digital clip on a camcorder input, piercing but thin, decaying in under two seconds. No music, no voice. Found-footage aesthetic.
```

---

### 3.21–3.24 老妇配音（TTS 占位 → 建议真人重录）

**角色**：农村老妇，近讲、干燥、沙哑、不戏剧化；像站在你肩后说话。  
**引擎**：字幕 `say()` 若包含下列 **子串** 会触发对应文件（见 `VOICE_LINES`）。

| 文件 | 键名 | 台词 | speed | emotion（TTS 参考） |
| --- | --- | --- | --- | --- |
| voice_open.mp3 | voiceOpen | 过来，让我看看你 | 0.82 | calm |
| voice_hand.mp3 | voiceHand | 手给我看看 | 0.80 | calm |
| voice_what.mp3 | voiceWhat | 你在拍什么 | 0.85 | fearful |
| voice_turn.mp3 | voiceTurn | 她总是这样回头 | 0.78 | calm |

**统一 English VO brief**：

```text
Elderly Chinese village woman, Mandarin, close-mic whisper-to-normal level, dry hoarse timbre, restrained fear, no theatrical acting. Room is a small shrine; no reverb added. Match lip-sync loosely to on-screen subtitles.
```

**MiniMax 参考音色**：`Chinese (Mandarin)_Kind-hearted_Elder` / `speech-2.8-hd`（占位，正式请演员或专业配音）。

---

### 3.25 `shutter.mp3` — DV 快门

- **触发**：第一遍供桌 `takePhoto()`（L）。  
- **时长**：~0.7 s。  
- **Prompt（2026-10-21 生成原文）**：

```text
One DV camcorder mechanical shutter click with a faint tape motor whir and tiny plastic button, close microphone, dry, no music, no voice, found-footage lo-fi.
```

---

### 3.26 `scan_ping.mp3` — 显影扫描

- **触发**：`completeCameraScan()` 每处显影完成。  
- **时长**：~0.45 s。  
- **Prompt（2026-10-21 生成原文）**：

```text
A very short DV tape static blip and soft high-frequency scan line sweep, 0.4 seconds, close mic, no music, no voice, found-footage lo-fi, subtle not harsh.
```

---

### 3.27 `room_shift.mp3` — 房间错位

- **触发**：第二遍找她 — `shiftHuntLayout()`（她换位、场景筷子/外套错位）。  
- **时长**：~2.2 s。  
- **Prompt（2026-10-21 生成原文）**：

```text
A short low wooden table scrape and chopstick rattle as a small offering table shifts an inch on concrete, one dry judder, close mic, no voice, no music, Chinese folk horror room, found footage lo-fi.
```

---

### 3.28 `hunt_empty.mp3` — 找空

- **触发**：第二遍在错误藏点按 E。  
- **时长**：~1.5 s。  
- **Prompt（2026-10-21 生成原文）**：

```text
A soft puff of dry ash and empty fabric rustle behind a curtain, no footsteps, no voice, disappointed hollow room tone under 1.5 seconds, close mic, lo-fi camcorder.
```

---

### 3.29 `phone_ring.mp3` — 走廊电话铃

- **触发**：第五遍走廊，电话未接时循环提示（`updateCorridor`）。  
- **时长**：~2.4 s（双响）。  
- **Prompt**：见 `PROMPTS_SOUND_ONLY.md` § phone_ring。

---

### 3.30 `voice_phone.mp3` — 接电话

- **触发**：走廊按 E 接电话（`answerPhone`）。  
- **台词**：你终于接电话了。别让她抬手。  
- **Prompt**：见 `PROMPTS_SOUND_ONLY.md` § voice_phone。

---

### 3.31 `ritual_ok.mp3` — 起仪成功

- **触发**：正确起仪 `completeRitual()`，与 `incense` 叠放。  
- **时长**：~2 s。  
- **Prompt**：见 `PROMPTS_SOUND_ONLY.md` § ritual_ok。

---

## 4. 复合 Cue（多轨同时播放）

制作时可按 **stem** 交付，引擎用 `MEDIA_CUES` 混音。

| Cue 名 | 场景 | 轨 1 | 轨 2 |
| --- | --- | --- | --- |
| `cameraReveal` | 第一次举起 DV，拍摄者 UI 出现 | revealImpact @ 0.18 | breath @ 0.95 |
| `uncanny` | 她无故回头 / 进入供桌循环 | uncannySwell @ 0.45 | moan @ 0.95 |
| `mismatch` | 错手、取景器里是另一只手 | squelch @ 0.30 | — |
| `reviewGap` | 回看时间轴进入 23:06 空白 | collapse @ 0.38 | — |
| `endingHelp` | 主结局「你走过去了」 | collapse2 @ 0.55 | — |
| `endingFilm` | 主结局「你一直在拍她」 | scream @ 0.40 | shriek @ 0.18 |

---

## 5. 仅字幕、尚无独立音频的台词（建议下一批 VO）

以下在 `game.js` 中为 `say('老妇：…')` 或旁白，**目前没有**独立 `voice_*.mp3`；若要做全配音，建议同一演员批量录。

| 建议优先级 | 台词（节选） | 场景 |
| --- | --- | --- |
| P0 | 你总是这样回头。先把香、水、线摆回去。 | 进入供桌循环 |
| P0 | ……对了。 / ……对了。手给我。 | 起仪成功 |
| P0 | 别回头。 | 第二次退出回看 |
| P1 | 她抬起手。指尖缠着白胶布。 / 对，就是这只。 | Q 抬手 |
| P1 | 取景器里，她抬的是另一只手。 | 错手 reveal |
| P1 | 这段没有录到。23 分 06 秒。 | 回看空白 |
| P2 | 三次。她站起来了。 / 找到你了。她又换了地方。 | 第二遍找她 |
| P2 | 她到你了。 | 第四遍躲失败 |
| P2 | 电话在门后。 | 第五遍走廊 |

**旁白/玩家主观句**（可选是否配音）：大量「取景器：…」「起仪前…」提示 — 建议保持 UI 字幕即可。

---

## 6. 程序化 WebAudio（非文件，供混音师知悉）

| 函数 | 听感 | 场景 |
| --- | --- | --- |
| `sCam()` | 短噪声 + 方波 blip | 举/放 DV、拍照时叠加 |
| `tone(36/48)` | 低频 sine | 起仪惊吓、照片惊吓 |
| `tone(880/1040)` | 电话铃 | **已替换为** `phone_ring.mp3` |
| `tone(40)` | 极低 sine | 显影「多一个人」风险 |
| `noise()` | 磁带噪 |  Various glitch |

正式版可将 `sCam()` / 部分 `tone(36/48)` **烘焙进** 对应 SFX；`shutter` / `scan_ping` / `phone_ring` 已落地。

---

## 7. 关联视觉素材（非 audio 目录但常一起重做）

| 资产 | 路径 | 说明 |
| --- | --- | --- |
| DV 循环视频 | `assets/video/footage_clip_5s.mp4` | 5 s 占位；建议 16:9 或 4:3 带 timecode 的循环带噪视频 |
| Key art | `assets/images/ji_keyart_v1.jpg` | 1998 印戳风格 |
| 老妇面部 | `assets/references/v2/` + `face_data.js` | 取景器特写；data URI 防 canvas 污染 |

视频 **English prompt 方向**（`assets/prompts/clip_v1.txt` 可扩展）：

```text
Handheld MiniDV footage inside a dim Chinese village shrine, 2003, warm tungsten and cold window, slight tracking noise, autofocus hunting, a woman in blue jacket seen from behind near an altar, no gore, 5–10 second seamless loop, 4:3, interlaced feel.
```

---

## 8. 生成工具备忘（内部）

| 用途 | 工具 |
| --- | --- |
| SFX（拟音类） | MiniMax Design `POST /api/generate/speech` + `backend: seedaudio` |
| 音乐 | `design music "…"` 或 `POST /api/generate/music` |
| 配音 | `design speech "…"` — voice `Chinese (Mandarin)_Kind-hearted_Elder` |
| 批处理脚本 | `dev/audio/design_seedaudio.sh` |

**seedaudio JSON 模板**：

```json
{
  "prompt": "<English prompt>",
  "backend": "seedaudio",
  "filename": "src_<name>",
  "params": {"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}
}
```

---

## 9. 验收清单（交给制作同事）

- [ ] 34 个文件替换后 `./dev/verify.sh` → `AUDIO PASS`  
- [ ] `window_rain.wav` / `bulb_hum.wav` 循环点无咔嗒（示波器或耳听）  
- [ ] 老妇 4 句 VO 与字幕时间轴对齐（`say()` 时长 2.8～4.2 s）  
- [ ] `oldBreath` 在 0.48 音量连续触发时不爆音、不疲劳（建议 3 变体轮播）  
- [ ] 耳机试玩全流程：help 结局 — 环境床不盖过 VO  
- [ ] 商业授权：演员肖像 / 音色 / 音乐版权归档（见 `RIGHTS.md`）

---

**文档版本**：2026-10-21 · 与 `game.js` `AUDIO_FILES` 同步。  
**维护**：新增音频时同步更新本表、`AUDIO_FILES`、本文件 §2 与 `PROMPTS.md`。
