# Release checklist — v2.8 audit hotfix

> 2026-10-20 审计后状态：P0 B1–B8 已修复；真实键盘 help 全流程 80.3s，0 pageerror；但 10 分钟目标仍失败。详见 [`audit/FIX_REPORT.md`](audit/FIX_REPORT.md)。当前只建议做 P0 回归，不建议直接上架。

## 已完成

- [ ] 完整流程真实按键复验 film/bad 结局（help 已过 80.3s）
- [x] 标题页 / 制作名单 / 暂停菜单 / 全屏 / 静音 / 闪烁效果
- [x] 46/46 自测通过（Chromium headless，`file://`）
- [x] 24/24 运行时音频在 `file://` 下加载通过（readyState 4，无 media error）
- [x] 运行时资源体积优化：WAV → MP3，关键美术 PNG → JPEG
- [x] DV 解码等待时使用同一卷带的 poster 静帧，不再闪回像素 fallback
- [x] 1280×720 商店截图 25 张 + 2752×1536 封面
- [x] itch 页面文案 / 标签 / 内容提示 / AI 披露
- [x] 运行时发布包 `dist/ji-she-in-frame-v2.8.zip`（约 13 MB）
- [x] 发布包校验和 `dist/ji-she-in-frame-v2.8.zip.sha256`
- [x] 发布包内 46/46 自测通过

## 上架前建议人工确认

- [ ] Chrome / Edge / Safari 各手动跑一遍（特别是 Safari 的 `file://` 媒体策略）
- [ ] 戴耳机完整听一遍 24 个音频，确认无爆音、无循环接缝
- [ ] 在 1280×720 / 1920×1080 / 2560×1440 检查像素缩放与标题排版
- [ ] 确认「闪烁效果：柔和」对光敏用户足够；必要时默认开启
- [ ] 录制 20–30 秒商店视频（举起 DV → 回看 23:06）
- [ ] 上传 itch：封面 → 截图 01–09（含 03b/03c/03c2/03d/03e/03f/03g/03h/03i/03j/03k/03l/03m/03n/03o/03p）→ zip → 文案
- [ ] 确认商店页保留“占位素材 / 正式版替换实拍”的说明

## 商业发行前必须替换

- [ ] 5 秒 DV clip：替换为实拍或已授权素材
- [ ] 老妇面部 / 等距参考 / 关键美术：替换为手绘或已授权素材
- [ ] 音乐 / 音效 / 语音：确认 MiniMax 生成内容的商用条款，或替换为原创/授权素材
- [ ] 字体：当前仅用系统字体，无需授权；若替换为嵌入字体需确认授权
- [ ] 完整 40 分钟章节、存档、设置持久化、手柄/移动端适配

## 复现验证

```bash
cd ji_third_person_demo
node --check game.js

# 自测（headless Chromium）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --use-angle=swiftshader --ignore-gpu-blocklist \
  --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir=/tmp/ji_qa --virtual-time-budget=50000 \
  --dump-dom "file://$PWD/index.html?nointro=1&test=1" | grep -o 'TEST PASS'

# 音频加载
# 打开 index.html?nointro=1&novideo=1&audiodbg=1，页面标题应为 AUDIO PASS
```
