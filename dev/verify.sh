#!/usr/bin/env bash
# Quick gate before试玩 / 打包：syntax + headless 自测 + 音频加载
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="file://${ROOT}/index.html"

echo "== node --check game.js =="
node --check game.js

if [[ ! -x "$CHROME" ]]; then
  echo "WARN: Chrome not found at $CHROME — skip browser checks"
  exit 0
fi

echo "== self-test (headless) =="
TEST_URL="${URL}?nointro=1&test=1"
pass=""
for attempt in 1 2 3 4 5; do
  title=$("$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
    --use-angle=swiftshader --ignore-gpu-blocklist \
    --allow-file-access-from-files --disable-web-security --mute-audio \
    --user-data-dir="/tmp/ji_verify_${attempt}_$$" \
    --virtual-time-budget=120000 --dump-dom "$TEST_URL" 2>/dev/null \
    | rg -o '<title>[^<]+</title>' | head -1 || true)
  echo "  attempt $attempt: $title"
  if echo "$title" | rg -q 'TEST PASS'; then pass=1; break; fi
  sleep 1
done
if [[ -z "$pass" ]]; then
  echo "FAIL: expected document.title TEST PASS"
  exit 1
fi

echo "== audio load (headless) =="
AUDIO_URL="${URL}?nointro=1&novideo=1&audiodbg=1"
atitle=$("$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --use-angle=swiftshader --ignore-gpu-blocklist \
  --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir="/tmp/ji_audio_$$" \
  --virtual-time-budget=45000 --dump-dom "$AUDIO_URL" 2>/dev/null \
  | rg -o '<title>[^<]+</title>' | head -1 || true)
echo "  $atitle"
echo "$atitle" | rg -q 'AUDIO PASS' || { echo "FAIL: expected AUDIO PASS"; exit 1; }

echo "== readability audit (darkroom / corridor / subtitle, ?lumtest=1) =="
ltitle=$("$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --use-angle=swiftshader --ignore-gpu-blocklist \
  --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir="/tmp/ji_lum_$$" \
  --virtual-time-budget=60000 --dump-dom "${URL}?nointro=1&lumtest=1&advance=6" 2>/dev/null \
  | rg -o '<title>[^<]+</title>' | head -1 || true)
echo "  ${ltitle:-<no title>}"
echo "$ltitle" | rg -q 'LUM PASS' || { echo "FAIL: readability audit (target lost on a dim display)"; exit 1; }

echo "== UI layout audit (1280x720 / 1024x768 / 800x480 / 1366x768 / 1920x1080 / 2560x1440) =="
ui_fail=0
for size in 1280,720 1024,768 800,480 1366,768 1920,1080 2560,1440; do
  utitle=$("$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
    --use-angle=swiftshader --ignore-gpu-blocklist \
    --allow-file-access-from-files --disable-web-security --mute-audio --hide-scrollbars \
    --window-size="$size" --user-data-dir="/tmp/ji_ui_${size//,/_}_$$" \
    --virtual-time-budget=60000 --dump-dom \
    "${URL}?nointro=1&uitest=1" 2>/dev/null \
    | rg -o '<title>[^<]+</title>' | head -1 || true)
  echo "  $size: ${utitle:-<no title>}"
  echo "$utitle" | rg -q 'UI PASS' || ui_fail=1
done
if [[ $ui_fail -ne 0 ]]; then
  echo "FAIL: UI layout audit (clipped/off-stage HUD text)"
  exit 1
fi

echo "== real-key e2e: three endings =="
if ! ./dev/e2e/run.sh help film bad; then
  echo "FAIL: ending regression"
  exit 1
fi

echo "== encrypted playtest gate =="
if [[ -f dev/beta_gate/gate_check.mjs ]]; then
  ./dev/deploy_beta.sh --dry-run >/tmp/ji_beta_build.log 2>&1 || {
    echo "FAIL: beta build"; tail -20 /tmp/ji_beta_build.log; exit 1; }
  node dev/beta_gate/gate_check.mjs .beta-site || { echo "FAIL: playtest gate"; exit 1; }
fi

echo "== release audit (version / package / credits) =="
# Build the zip first so the audit can prove the artifact matches the tree.
./dev/package.sh >/tmp/ji_pkg.log 2>&1 || { echo "FAIL: package"; tail -10 /tmp/ji_pkg.log; exit 1; }
grep -E '^built ' /tmp/ji_pkg.log | sed 's/^/  /'
node dev/release_audit.mjs || { echo "FAIL: release audit"; exit 1; }

echo "== playtest recorder (beta-only) =="
if [[ -f playtest/recorder.js ]]; then
  ./dev/beta_check.sh || { echo "FAIL: beta recorder / report"; exit 1; }
fi

echo "OK — ready to试玩 (see TRIAL_PLAY.md)"
