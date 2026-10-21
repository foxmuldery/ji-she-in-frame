# 《祭》v2 — reference image prompts / 参考图提示词

Generated for the third-person pixel demo of 《祭》, via the running **MiniMax Design 4.0.2** desktop app's local gateway.

| Item | Value |
|---|---|
| Endpoint | `POST http://127.0.0.1:8001/api/generate/image` |
| Backend | `nano_banana` |
| Model | `nano_banana_2_flash` (General Image 2) |
| Params | `aspect_ratio: 16:9`, `resolution: 2K` |
| Raw output | 2752×1536 (16:9), app `output_files/` |
| Delivered | 480×270 PNG, 16-colour quantized (see post-process below) |
| Date | 2026-10-19 (Asia/Shanghai) |

Both prompts are reproduced **verbatim**, as sent. Negative constraints are inside each prompt; no separate negative prompt was used.

---

## 1. `ji_iso_eerie_v2.png` — isometric night shrine

```text
16-bit isometric pixel-art game scene, one single 480x270 frame for a Chinese found-footage horror game set in a rural ancestral shrine in 1998. True 2:1 isometric projection, camera looking slightly down into one small shrine room at night. Composition: mid-ground, a low red altar table with chipped lacquer, holding a brass incense bowl, three burned-down incense sticks, two guttering red candles, a shallow white bowl of water and a stack of spirit money. A single bare tungsten bulb hangs low on a black cord straight above the table, its weak amber pool the only warm light. Behind the table an ancient woman sits bolt upright, hands folded on her lap, far too still: faded indigo-blue high-collar jacket, grey hair in a tight bun, her face a pale smudge with two dark sockets, one eye catching a milky glint. Render her sparingly, nearly a silhouette, only the face, collar and folded hands modelled. In the foreground, seen from behind, a young woman in a white blouse and dark red skirt stands with her back to the viewer, shoulders tense, one hand loose at her side; she is mostly cold blue-grey rim light, her face never visible. Deep soot-black negative space fills the upper third and the right edge, swallowing most of the room.

Lighting and palette: one cold blue window shaft cuts diagonally across the cracked concrete floor from a high barred window on the left wall, hard-edged, with coarse pixel dithering along the falloff. Dried-blood red altar cloth, sickly tungsten amber bulb glow, bone-white highlights, cold corpse-blue shadows. Restricted 16-colour palette, hard 1px outlines, ordered dithering, no anti-aliasing, no soft gradients, no bloom, no blur, no 3D render, no painterly brushstrokes.

Eerie details, small and half-hidden, deliberately not all rendered with equal weight: on the back wall a row of ancestor portraits in black frames, their eyes scratched out with pale diagonals; a stopped wall clock, thin hands frozen at 3:47; a wooden chair turned to face the bare wall in the corner; a black doorway with a pair of wet shoes placed neatly outside it; wet footprints crossing the concrete from that doorway to the altar table, catching the blue light; a taut red thread running from the table leg across the floor to the door; a paper talisman pasted on the doorframe with a faint suggestion of a face in its ink; incense smoke curling upward and resolving into the shape of a thin hand; a second wrong shadow on the wall behind the seated woman that carries two heads, one slightly lower than the other; in the shallow bowl on the table, a tiny reflection of the old woman's face, while the young woman standing before it casts no reflection at all. Low fog crawls along the floor in flat dithered bands.

Restrained and impressionistic, 写意: large calm areas of near-black, only a few objects fully modelled, everything else suggested by two or three values. Mood quiet, wrong, sacred, unbearable. No text, no lettering, no numbers, no UI, no HUD, no watermark, no gore, no blood spatter, no monster, no jump-scare face.
```

---

## 2. `ji_oldwoman_face_v2.png` — old woman close-up

```text
16-bit pixel-art close-up portrait, one single 480x270 frame, of an ancient Chinese village woman from a rural ancestral shrine — a face that is patient, still, and wrong. Head and shoulders, slightly off-centre, her head tilted a few degrees too far to one side. Grey hair pulled into a tight low bun, strands pasted flat to the temple, the bun heavy and a little lopsided. Her face is gaunt and waxy, skin like grey rice paper over bone, hollow cheeks, deep wrinkles, a few dark liver spots, the jaw a little too heavy. Faded indigo-blue high-collar jacket, side-buttoned, collar greasy and worn pale, a sliver of black lining at the thin neck.

Her right eye is clouded milk-white and blind, slightly larger than the other, the pupil a faint grey shadow; her left eye is dark brown, small, dry, and fixed on the viewer without moving. The faint wrong smile: the corners of her mouth lifted only slightly, one corner a millimetre higher than the other, lips slightly parted on a dark gap, no teeth, no warmth reaching the eyes. She is not snarling, not screaming; she is calm, as if she has been waiting a long time and knows how this ends. Exquisite, eerie, 写意.

Light: a single bare tungsten bulb hangs above and out of frame at the top edge, its sickly amber warming only the left cheekbone and the edge of the bun; a cold corpse-blue rim light from a window behind her traces the right cheek, the ear and one shoulder. Half her face falls into near-black; the soot-black background is almost empty, only a faint wall seam, a hanging cord and the black edge of a doorframe. Bone-white highlights on the brow, the bridge of the nose and the blind eye; deep umber and near-black in the sockets, the nostrils and under the chin; a dried-blood red glint deep in the dark eye.

Hard 1px detail, single-pixel catchlights, hard ordered dithering on every light falloff, restricted 16-colour palette, no anti-aliasing, no soft gradients, no bloom, no blur, no 3D render, no photo. Fully render the eyes and mouth; leave the hair and the background as broad flat shapes. No text, no lettering, no UI, no watermark, no gore, no blood, no teeth, no scream, no monster.
```

---

## Post-process / 后处理

Both raw generations were resampled to the game's internal 480×270 pixel layer and reduced to a strict 16-colour indexed PNG, with dithering **disabled during reduction** so the art's own pixel dither survives rather than being replaced by resampling noise:

| File | Resample | Palette |
|---|---|---|
| `ji_iso_eerie_v2.png` | nearest-neighbour point sample to 480×270 (keeps the drawn dither and 1px edges) | 16 colours, `+dither -colors 16` |
| `ji_oldwoman_face_v2.png` | Lanczos to 480×270 (keeps facial modelling legible at this size) | 16 colours, `+dither -colors 16` |

Exact command form:

```bash
magick <raw>.png -filter point    -resize 480x270! +dither -colors 16 -strip -define png:color-type=3 ji_iso_eerie_v2.png
magick <raw>.png -filter Lanczos  -resize 480x270! +dither -colors 16 -strip -define png:color-type=3 ji_oldwoman_face_v2.png
```

The raw 2752×1536 files remain in the app's `output_files/` under the names recorded in `MANIFEST.json`; they are not duplicated here because the deliverable is the 480×270 version.

## Attempts / 说明

- The isometric scene was generated in one pass.
- The portrait was generated twice. The first pass was technically clean but read too warm and healthy; it was rejected. The second pass (prompt above) is the delivered image — gaunter, greyer, with the blind eye and the wrong smile reading clearly.
- AI pixel art is not a strict 1× pixel grid. These are reference images for the pixel line, not final sprite sheets.
- The clock in the shrine is present and stopped, but at 480×270 its hands are only a few pixels and do not legibly read 3:47. The bowl reflection and the talisman's faint face are likewise suggestions rather than literal, legible details — deliberate 写意 restraint, but worth knowing before art passes them to an animator.
