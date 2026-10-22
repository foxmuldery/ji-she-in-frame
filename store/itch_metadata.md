# itch.io 页面字段

## Title
祭：她在画面里

## English title
She Is in the Frame

## Tagline / short description
你以为你在扮演她。直到你举起摄影机。  
一款单周目约 10 分钟（模拟中位 9:38）的 found-footage 心理恐怖短片游戏：真等距像素房间 × 第一人称旧带 DV × 五遍循环解谜 + 门后暗房第二幕。

## Classification
- Genre: Adventure / Horror / Interactive Fiction
- Made with: HTML5
- Status: Prototype / vertical slice
- Release date: 2026-10-22
- Version: v2.10.2

## Tags
horror, found-footage, psychological-horror, pixel-art, isometric, short, narrative, experimental, chinese, offline, singleplayer

## Players
Single player

## Input
Keyboard, mouse (desktop). No touch controls; the game needs `W A S D`, `F`, `R`, `Tab`.
Touch-only devices get an explicit "keyboard required" page before the title screen
(and a standing note on it) instead of starting a room they cannot walk in; a tablet
with a keyboard or trackpad is let through automatically.

## Trailer
`store/trailer_26s.mp4` — 26.0 s, 1280×720, 30 fps, H.264 + AAC. Rebuilt from the game's own renderer by `dev/trailer/run.mjs`.

## Platforms
- Windows / macOS / Linux: download and open `index.html` in Chrome, Edge or Safari
- No installation, no internet required

## Price
Free (prototype). Optional donation if you want to support the next chapter.

## Content warnings
尸体、血迹、惊悚暗示、突然的音效、磁带闪烁/跟踪带。无血腥特写。

## Accessibility
- 闪烁效果：柔和（暂停菜单，或系统“减少动态效果”自动开启）
- 静音：`M` / HUD 按钮
- 全屏：标题页 / 暂停菜单
- 键盘可完成全部流程（标题页 `Enter` / `空格` 开始，结局卡 `Enter` 重开 / `C` 名单 / `Esc` 回标题）
- HUD 随窗口等比缩放：1080p / 1440p 下字幕与章节目标保持可读
- 暗房与走廊的暗部亮度按「低亮度笔记本」校准过（55% 显示增益下仍可辨认目标）
- 字幕：所有台词均有中文字幕
- 无快速反应 QTE、无失败惩罚

## AI disclosure
占位资产（DV 视频、关键美术、部分参考图、音效、音乐、老妇语音）由 MiniMax Design 生成；代码、像素场景与交互由本原型制作。正式版将替换为实拍与手绘像素素材。

## Credits
- 原作 / 改编：40 分钟 found-footage《祭》
- 像素场景 / 代码 / 交互：DeepSeek Harness 协作原型
- 占位图像 / 声音 / 音乐 / 视频：MiniMax Design
- CRT 着色器：RetroZone ShaderOverlay (MIT)
- 字体：系统字体

## Links
- Devlog / 开发记录：`DEVLOG.md`
- 试玩指南 / 操作与流程：`TRIAL_PLAY.md`
- 上架前仍需人工确认的项：`RELEASE_CHECKLIST.md`
- 素材清单：`assets/MANIFEST.json`、`assets/audio/SOUND_MANIFEST.json`
