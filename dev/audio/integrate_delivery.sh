#!/usr/bin/env bash
# Swap the 2026-10-22 MiniMax audio re-delivery into assets/audio without
# changing the mix.
#
# The delivered masters are intentionally quiet (voice peaks ≈ -14 dBFS,
# ambience one-shots lower still), roughly 3–17 dB under the levels the shipping
# build was tuned against. Instead of retuning every playMedia() volume, each
# file gets the exact gain that restores the previous peak
# (`dev/audio/delivery_gains.tsv`, old_peak - new_peak).
#
# ffmpeg must never read stdin: it would swallow a character of the gains file
# (that is how music_eerie_bed_90s.mp3 once became "usic_eerie...").
#
#   ./dev/audio/integrate_delivery.sh /tmp/ji_dl/assets/audio
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SRC="${1:?usage: integrate_delivery.sh <delivery assets/audio dir>}"
GAINS="dev/audio/delivery_gains.tsv"
DST="assets/audio"
[[ -d "$SRC" ]] || { echo "FAIL: no such dir $SRC"; exit 1; }
command -v ffmpeg >/dev/null || { echo "FAIL: ffmpeg not found"; exit 1; }

peak() {
  ffmpeg -nostdin -hide_banner -nostats -i "$1" -af volumedetect -f null - 2>&1 \
    | rg -o 'max_volume: (-?[0-9.]+) dB' | rg -o '\-?[0-9.]+' | head -1
}

fail=0
while IFS=$'\t' read -r file gain; do
  [[ -z "$file" || "$file" == \#* ]] && continue
  in="$SRC/$file"
  [[ -f "$in" ]] || { echo "  MISSING $file"; fail=1; continue; }
  case "$file" in
    *.mp3) ffmpeg -nostdin -y -hide_banner -loglevel error -i "$in" \
             -af "volume=${gain}dB" -c:a libmp3lame -b:a 192k -ar 44100 "$DST/$file" ;;
    *.wav) ffmpeg -nostdin -y -hide_banner -loglevel error -i "$in" \
             -af "volume=${gain}dB" -c:a pcm_s16le -ar 48000 "$DST/$file" ;;
  esac
  pk=$(peak "$DST/$file")
  printf '  %-26s %+6s dB -> peak %s dBFS\n' "$file" "$gain" "$pk"
  # Anything at or above -0.5 dBFS would clip once the engine adds its own
  # fades; the old masters never went past -0.7.
  awk -v p="$pk" 'BEGIN{ if (p+0 > -0.5) exit 1 }' || { echo "    FAIL: too hot"; fail=1; }
done < "$GAINS"

exit $fail
