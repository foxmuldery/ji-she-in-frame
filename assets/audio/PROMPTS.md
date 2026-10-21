# PROMPTS — 《祭》 / Ji sound kit

Generated **2026-10-19** through the running, logged-in **MiniMax Design** desktop app's local gateway.

- Gateway: `http://127.0.0.1:8001`
- SFX + voice: `POST /api/generate/speech` (legacy synchronous endpoint)
- Music: `POST /api/generate/music`
- No MCP server, no caller key, no token was read, printed, or stored. The gateway used the app's own login.
- Every file below was generated in this session; nothing was copied from the earlier `app-generated/` reference set.

## Backends and models

| Layer | `backend` | model | Notes |
|---|---|---|---|
| SFX | `seedaudio` | `seed-audio-1.0` | params: `sample_rate`, `pitch`, `volume`, `speed` |
| Music | `minimax_music` | `music-3.0` | `is_instrumental=instrumental` |
| Voice | `minimax_tts` | `speech-2.8-hd` | params: `voice_id`, `speed`, `emotion` |

## SFX prompts (verbatim)

### 1. clock_tick.wav

*Tick in a silent room · target 3.0 s · `POST /api/generate/speech` · backend `seedaudio` · params `{"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}` · request filename `src_clock_tick`*

```text
One single slow dull mechanical clock tick in an absolutely silent room, close to the microphone. A heavy brass-and-wood mantel clock escapement: a soft wooden thunk with a faint metallic tinkle, slightly irregular timing, followed by a tiny gear settle and a dry tick a beat later. No reverb tail, no room tone, no music, no voice, no ticking loop, no clock chime. Dry, intimate, lo-fi, recorded on a cheap camcorder.
```

### 2. water_drip.wav

*Drip into the shallow ceramic bowl · target 3.6 s · `POST /api/generate/speech` · backend `seedaudio` · params `{"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}` · request filename `src_water_drip`*

```text
One single slow water drip falling into a shallow glazed ceramic bowl in a quiet stone room, close to the microphone. A soft wet plip with a tiny rising ceramic resonance and a short wet tail, then one smaller secondary droplet settling. No music, no voice, no continuous water, no reverb longer than a second. Intimate, damp, lo-fi, recorded on a cheap camcorder.
```

### 3. door_creak.wav

*Old wooden door opening a few inches · target 4.0 s · `POST /api/generate/speech` · backend `seedaudio` · params `{"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}` · request filename `src_door_creak`*

```text
A long low wooden door creak, an old dry hinge giving way as the door opens just a few inches, close to the microphone. Wood grain grinding and sticking, a low groan with stick-slip judder, then the door settling still. Very dry, no music, no voice, no reverb, no slam, no latch click.
```

### 4. wet_steps.wav

*Six wet barefoot steps approaching · target 6.0 s · `POST /api/generate/speech` · backend `seedaudio` · params `{"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}` · request filename `src_wet_steps`*

```text
Six slow wet barefoot steps on cracked concrete, approaching from a distance and ending close to the microphone. Wet soles peeling and slapping the floor, a faint film of water, slight natural echo of a narrow tiled hallway. No voice, no breathing, no music, no thunder. Field recording, lo-fi, slightly muffled.
```

### 5. chair_scrape.wav

*The wall-facing chair dragged once · target 2.0 s · `POST /api/generate/speech` · backend `seedaudio` · params `{"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}` · request filename `src_chair_scrape`*

```text
A single short dry wooden chair leg scraping once across bare concrete, close to the microphone. Abrupt friction rasp with a tiny wood creak, then silence. No music, no voice, no reverb, no impact, no chair fall.
```

### 6. incense_whisper.wav

*Smoke hiss and one soft breath · target 5.0 s · `POST /api/generate/speech` · backend `seedaudio` · params `{"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}` · request filename `src_incense_whisper_b`*

```text
Five continuous seconds of a dry faint whisper-like hiss of incense smoke drifting close to the microphone, airy and granular, with one soft human breath through the nose and a faint throat click, no words, no voice. Quiet, close, almost subliminal, steady. No music, no reverb, no wind.
```

> A first take (2.59 s) was too short for the 5 s cue; this second take was generated with the same voice and a "five continuous seconds" instruction and cut to 5.0 s.

### 7. bulb_hum.wav

*Amber bulb hum, seamless loop · target 6.0 s · `POST /api/generate/speech` · backend `seedaudio` · params `{"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}` · request filename `src_bulb_hum`*

```text
Low electrical mains hum from a single bare incandescent light bulb, steady 50 Hz family drone with faint filament crackle and subtle flicker pulses, a very quiet dark room behind it. Continuous steady texture suitable for a seamless loop. No music, no voice, no clicks, no buzz bursts.
```

### 8. window_rain.wav

*Rain on the shutter, seamless loop · target 12.0 s · `POST /api/generate/speech` · backend `seedaudio` · params `{"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}` · request filename `src_window_rain`*

```text
Soft night rain and low wind pressing against a closed wooden shutter, heard from inside a dark room, muffled and low. Steady continuous texture suitable for a seamless loop. No thunder, no voice, no music, no drips, no gutter.
```

### 9. oldwoman_breath.wav

*Old woman's ragged breathing · target 6.0 s · `POST /api/generate/speech` · backend `seedaudio` · params `{"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}` · request filename `src_oldwoman_breath`*

```text
An old woman's close, ragged, shallow breathing, slightly wet in the throat, frightened and keeping very still, recorded very close to the microphone. Quiet, uneven, effortful. No voice, no words, no music, no room reverb.
```

## Music prompt (verbatim)

*`POST /api/generate/music` · backend `minimax_music` · params `{"is_instrumental": "instrumental"}` · request filename `src_music_eerie_bed`*

```text
Sparse ritual horror film score for a 16-bit pixel-art Chinese folk-horror shrine, 90 seconds, almost static and patient, funereal, 写意. A very low sub drone that never resolves, one bowed cello harmonic drifting slowly out of tune, a distant small Chinese ritual bell struck once every twenty seconds with long decay, and a breath-like tape hiss texture breathing underneath. Chinese folk instrumentation (erhu/xiao/bell) buried in tape saturation, wow and flutter. No drums, no percussion, no melody loop, no vocals, no choir, no jump-scare stingers. Extremely restrained, cold, humid, ancient. Mono-compatible, analog tape realism.
```

The model returned **141.6 s**. The deliverable is a **90.0 s** excerpt: source window 2.0–92.0 s, 2 s fade-in, 4.5 s fade-out, peak −1.5 dBFS, encoded 320 kbps MP3.

## Voice prompts (verbatim)

Voice: `Chinese (Mandarin)_Kind-hearted_Elder` (花甲奶奶 — 略带沙哑, 娓娓道来, 老年女声, 中文-普通话). A Mandarin elderly female voice with a naturally dry/hoarse edge; no pitch shifting was applied to fake age.

| File | Text submitted | speed | emotion | TTS duration | Subtitled text returned |
|---|---|---|---|---|---|
| `voice_hand.wav` | 手给我看看。 | 0.8 | calm | 2.50 s | 手给我看看。 |
| `voice_what.wav` | 你在拍什么？ | 0.85 | fearful | 2.60 s | 你在拍什么？ |
| `voice_turn.wav` | 她总是这样回头。 | 0.78 | calm | 2.80 s | 她总是这样回头。 |

The three lines were submitted one at a time with the same voice so they match as one character. Emotion was used only as a slight push (`calm` for the two flat lines, `fearful` for “你在拍什么？”); the performance stays quiet and close rather than theatrical.

## Reproduction

With MiniMax Design running and logged in (the gateway carries the login), from the directory holding the request JSONs:

```bash
curl -sS -X POST http://127.0.0.1:8001/api/generate/speech \
  -H 'Content-Type: application/json' \
  --data-binary @req_clock_tick.json
# -> {"ok":true,"path":"src_clock_tick.wav","duration":7,...}

curl -sS -X POST http://127.0.0.1:8001/api/generate/music \
  -H 'Content-Type: application/json' \
  --data-binary @req_music_eerie_bed.json
```

Outputs were generated into an external `output_files/` directory; request/response JSONs are kept outside the game asset folder and are not required to run the game.

## Post-processing

All edits were done with `ffmpeg` and Python/NumPy on the gateway outputs; no generative fill or resynthesis.

- **One-shots** were trimmed to the requested length around the intended transient, given short fades, and peak-normalised. See `SOUND_MANIFEST.json → files[].processing` for the exact window and gain per file.
- **wet_steps.wav**: the 8.0 s take contained more than six footfalls. A 6.0 s window (0.55–6.55 s) was chosen and given a +7 dB linear approach ramp so the last steps land close.
- **bulb_hum.wav / window_rain.wav**: seamless loops built by equal-power *head overlap-add* — the loop head is a crossfade of the material immediately after the loop end into the true head, which makes the wrap sample-continuous. Crossfades: 0.5 s and 1.5 s. Verified: end/start sample jump (0.0002 / 0.0030) is below the 99.9th percentile of within-file adjacent-sample differences (0.0076 / 0.0139).
- **Voice**: decoded from 32 kHz mono MP3, 70 Hz high-pass, gentle 2:1 compression, trailing silence trimmed with a 0.18 s tail, short fades, −3 dBFS peak, 48 kHz mono WAV.
- **Music**: 90.0 s excerpt re-encoded to MP3 320 kbps / 48 kHz stereo (no upsampling of the musical content beyond the model's own output).

## Verification

Every duration below was read back from the delivered file with `ffprobe`; peaks/RMS with `ffmpeg`/`astats` and a NumPy decode. No file in the kit is missing or placeholder.

| File | Duration | Format | Peak | RMS | Loop |
|---|---|---|---|---|---|
| `clock_tick.wav` | 3.000 s | WAV PCM16 48k stereo | -6.0 dBFS | -30.91 dBFS | — |
| `water_drip.wav` | 3.600 s | WAV PCM16 48k stereo | -3.0 dBFS | -28.84 dBFS | — |
| `door_creak.wav` | 4.000 s | WAV PCM16 48k stereo | -6.0 dBFS | -26.9 dBFS | — |
| `wet_steps.wav` | 6.000 s | WAV PCM16 48k stereo | -6.0 dBFS | -31.82 dBFS | — |
| `chair_scrape.wav` | 2.000 s | WAV PCM16 48k stereo | -5.0 dBFS | -23.0 dBFS | — |
| `incense_whisper.wav` | 5.000 s | WAV PCM16 48k stereo | -9.0 dBFS | -23.13 dBFS | — |
| `bulb_hum.wav` | 6.000 s | WAV PCM16 48k stereo | -14.0 dBFS | -26.26 dBFS | yes |
| `window_rain.wav` | 12.000 s | WAV PCM16 48k stereo | -12.0 dBFS | -29.33 dBFS | yes |
| `oldwoman_breath.wav` | 6.000 s | WAV PCM16 48k stereo | -9.0 dBFS | -26.51 dBFS | — |
| `music_eerie_bed_90s.mp3` | 90.000 s | MP3 320k | -1.5 dBFS | -25.36 dBFS | — |
| `voice_hand.wav` | 2.431 s | WAV PCM16 48k mono | -3.0 dBFS | -18.69 dBFS | — |
| `voice_what.wav` | 2.579 s | WAV PCM16 48k mono | -3.0 dBFS | -16.71 dBFS | — |
| `voice_turn.wav` | 2.737 s | WAV PCM16 48k mono | -3.0 dBFS | -17.51 dBFS | — |

## Known limitations

- SeedAudio has no exact-duration control; lengths came from trimming and looping. The clock tick and wet steps takes contained extra events, so the delivered files are windows of longer takes (documented above).
- MiniMax Music-3.0 returned 141.6 s for a 90 s request; the bed is an excerpt, not a purpose-built 90 s master.
- The source door creak, clock tick and old-woman breath were very quiet (peaks −30 to −39 dBFS) and needed 24–30 dB of make-up gain. Listen for raised noise floor at high monitor level.
- These are generated assets, not recordings: foley realism is approximate. Voice timbre is a library voice, not a bespoke performance; the words and timing are correct, but a director may want a second take with different emotion values.
- No human listening pass was possible in this session; quality judgements here are based on prompts, waveform/spectral statistics, and the TTS subtitle alignment.
