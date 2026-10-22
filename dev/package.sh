#!/usr/bin/env bash
# Build the shippable zip: runtime files only, plus the docs a player or store
# reviewer needs. Dev tooling (dev/, audit/, store/) and generation sources
# (assets/audio/source, prompts, references) stay out of the package.
#
#   ./dev/package.sh            # dist/ji-she-in-frame-v<version>.zip + .sha256
#   ./dev/package.sh --check    # verify an existing package instead of building
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VER="$(tr -d '[:space:]' < VERSION)"
NAME="ji-she-in-frame-v${VER}"
OUT="dist/${NAME}.zip"
mkdir -p dist

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
PKG="${STAGE}/${NAME}"
mkdir -p "$PKG/assets"

cp index.html style.css game.js VERSION "$PKG/"
cp README.md TRIAL_PLAY.md RIGHTS.md RELEASE_CHECKLIST.md "$PKG/"
cp vendor -R "$PKG/vendor" 2>/dev/null || mkdir -p "$PKG/vendor" && cp -R vendor/. "$PKG/vendor/"

# runtime assets
mkdir -p "$PKG/assets/audio" "$PKG/assets/images" "$PKG/assets/video"
cp assets/audio/*.mp3 assets/audio/*.wav "$PKG/assets/audio/" 2>/dev/null || true
cp assets/audio/PROMPTS_SOUND_ONLY.md assets/audio/AUDIO_PRODUCTION_HANDOFF.md \
   assets/audio/AUDIO_ASSET_DELIVERY_REPORT.md "$PKG/assets/audio/" 2>/dev/null || true
cp assets/images/*.jpg assets/images/*.svg "$PKG/assets/images/" 2>/dev/null || true
cp assets/video/*.mp4 "$PKG/assets/video/" 2>/dev/null || true
cp assets/poster_data.js assets/face_data.js assets/CREDITS.md assets/MANIFEST.json "$PKG/assets/" 2>/dev/null || true

# honest content warning + credits inside the package
cp assets/CREDITS.md "$PKG/CREDITS.md"

find "$PKG" -name '.DS_Store' -delete
rm -f "$OUT" "${OUT}.sha256"
( cd "$STAGE" && zip -qr "$ROOT/$OUT" "$NAME" -x '*.DS_Store' )
( cd dist && shasum -a 256 "$(basename "$OUT")" > "$(basename "$OUT").sha256" )

SIZE="$(du -h "$OUT" | cut -f1 | tr -d ' ')"
FILES="$(unzip -l "$OUT" | tail -1 | awk '{print $2}')"
echo "built $OUT (${SIZE}, ${FILES} files)"
cat "dist/${NAME}.zip.sha256"
