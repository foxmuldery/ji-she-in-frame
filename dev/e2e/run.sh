#!/usr/bin/env bash
# Real-key ending regression: one full playthrough per ending.
#
# Every input is a real window KeyboardEvent dispatched into the page, so all of
# the game's guards (inputLock, caseOpen, paused, review, transition) apply, and
# every decision is made from text that is actually on screen (#prompt,
# #subtitle, #chapterHud, #case). Nothing writes to `state` to skip a puzzle.
#
# The three runs are deterministic (fixed seed, competent-player profile) and
# assert the ending card title, not just an internal flag.
#
#   ./dev/e2e/run.sh            # help + film + bad
#   ./dev/e2e/run.sh help       # one ending
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="file://${ROOT}/index.html"

if [[ ! -x "$CHROME" ]]; then
  echo "WARN: Chrome not found at $CHROME — skipping e2e"
  exit 0
fi

ENDS=("$@")
if [[ ${#ENDS[@]} -eq 0 ]]; then ENDS=(help film bad); fi

fail=0
for e in "${ENDS[@]}"; do
  title=$("$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
    --use-angle=swiftshader --ignore-gpu-blocklist \
    --allow-file-access-from-files --disable-web-security --mute-audio \
    --user-data-dir="/tmp/ji_e2e_${e}_$$" \
    --virtual-time-budget=120000 --dump-dom \
    "${URL}?nointro=1&naive=1&e2e=${e}" 2>/dev/null \
    | rg -o '<title>[^<]+</title>' | head -1 || true)
  echo "  ${title:-<no title>}"
  if ! echo "$title" | rg -q "E2E PASS ${e}"; then fail=1; fi
done

if [[ $fail -ne 0 ]]; then
  echo "FAIL: real-key ending regression (see titles above)"
  exit 1
fi
echo "e2e OK — help / film / bad reachable with real key events"
