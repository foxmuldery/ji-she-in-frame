#!/usr/bin/env bash
# 内测记录器 + 落地页自检。不联网，不发布，只证明这一份构建能记录、能复盘。
#
#   ./dev/beta_check.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="file://${ROOT}/index.html"

echo "== node --check playtest/recorder.js =="
node --check playtest/recorder.js

echo "== recorder boot (headless, ?rec=1&rectest=1) =="
if [[ -x "$CHROME" ]]; then
  dom=$("$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
    --use-angle=swiftshader --ignore-gpu-blocklist \
    --allow-file-access-from-files --disable-web-security --mute-audio \
    --user-data-dir="/tmp/ji_beta_$$" \
    --virtual-time-budget=40000 --dump-dom \
    "${URL}?nointro=1&rec=1&rectest=1&advance=12" 2>/dev/null || true)
  verdict=$(echo "$dom" | rg -o 'data-verdict="[^"]*"' | head -1 || true)
  evs=$(echo "$dom" | rg -o 'data-events="[0-9]+"' | head -1 || true)
  echo "  ${verdict:-<no verdict>} ${evs:-}"
  echo "$dom" | rg -q 'id="recPill"' || { echo "FAIL: recorder UI missing"; exit 1; }
  echo "$dom" | rg -q 'id="recPanel"' || { echo "FAIL: recorder panel missing"; exit 1; }
  echo "$verdict" | rg -q 'PASS' || { echo "FAIL: recorder payload incomplete"; exit 1; }

  echo "== report page renders a session =="
  rdom=$("$CHROME" --headless=new --no-sandbox --allow-file-access-from-files \
    --mute-audio --window-size=1180,1200 --user-data-dir="/tmp/ji_rep_$$" \
    --virtual-time-budget=8000 --dump-dom \
    "file://${ROOT}/playtest/report.html?demo=1" 2>/dev/null || true)
  echo "$rdom" | rg -q '试玩时长' || { echo "FAIL: report cards missing"; exit 1; }
  echo "$rdom" | rg -q '结局' || { echo "FAIL: report ending row missing"; exit 1; }
  # several sessions must roll up: the point of a playtest is the distribution
  echo "$rdom" | rg -q '全部 3 份' || { echo "FAIL: report session switcher missing"; exit 1; }
  adom=$("$CHROME" --headless=new --no-sandbox --allow-file-access-from-files \
    --mute-audio --window-size=1180,1500 --user-data-dir="/tmp/ji_aggr_$$" \
    --virtual-time-budget=9000 --dump-dom \
    "file://${ROOT}/playtest/report.html?demo=1&agg=1" 2>/dev/null || true)
  echo "$adom" | rg -q '全部记录' || { echo "FAIL: aggregate head missing"; exit 1; }
  echo "$adom" | rg -q '时长中位' || { echo "FAIL: aggregate duration missing"; exit 1; }
  echo "$adom" | rg -q '停在' || { echo "FAIL: aggregate drop-off missing"; exit 1; }
  echo "$adom" | rg -q '第一遍 · 供桌' || { echo "FAIL: aggregate chapter table missing"; exit 1; }
else
  echo "WARN: Chrome not found — skipped browser checks"
fi

echo "== landing page links resolve =="
for f in playtest/beta.html playtest/report.html playtest/recorder.js playtest/recorder.css assets/images/ji_keyart_v1.jpg; do
  [[ -f "$f" ]] || { echo "FAIL: missing $f"; exit 1; }
done
rg -qF 'index.html?rec=1' playtest/beta.html || { echo "FAIL: beta.html has no recorder entry"; exit 1; }
rg -q 'report.html' playtest/beta.html || { echo "FAIL: beta.html has no report link"; exit 1; }

echo "OK — beta build recordable and reviewable"
