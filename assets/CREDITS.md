# Asset credits

These assets were generated on the user's desktop **MiniMax Design** app via its
local gateway on 2026-10-19 and 2026-10-20.

- Images / key art / reference sheets: `nano_banana`
- Ambience / music: `minimax_music`
- SFX: `seedaudio`
- Voice: `minimax_tts` / `speech-2.8-hd`
  (`Chinese (Mandarin)_Kind-hearted_Elder`)
- Video: `minimax_v3`
- Prompts: `assets/prompts/`, `assets/audio/PROMPTS.md`,
  `assets/references/v2/PROMPTS.md`

They are placeholders/references for the《祭》prototype, not final film footage.
The key art's date stamp reads 1998-11-03 (from the generation prompt); the
game's diegetic date is 2003-08-17, and the old tape is labelled 1998–1999.

## Runtime asset notes

- One-shot SFX and voice lines were converted from WAV to 128 kbps MP3 for the
  shelf build. Source WAVs are retained in `assets/audio/source/` and are not
  part of the release zip.
- `window_rain.wav` and `bulb_hum.wav` remain WAV because they are seamless
  loops; `ambience_45s.mp3` and `music_eerie_bed_90s.mp3` are the music beds.
- `ji_keyart_v1.jpg` and `ji_clip_v1_poster.jpg` are high-quality JPEG exports of
  the original PNGs for faster `file://` loading.
- The live DV layer uses `assets/video/footage_clip_5s.mp4`. When the decoder is
  still spinning up, or autoplay is blocked, the game holds the poster frame
  from the same clip instead of flashing the pixel fallback.
- CRT shader: RetroZone ShaderOverlay, MIT. See
  `vendor/retrozone-LICENSE.txt`.

## Fonts

No font files are distributed. The UI uses system fonts:
`Songti SC` / `STSong` / `SimSun`, `PingFang SC`, and `Courier New`.

## Disclosure

This is a non-commercial prototype. Generated assets are not cleared for a
final commercial release; replace them with live-action footage and hand-drawn
pixel art, and complete the relevant rights clearances, before selling the game.
