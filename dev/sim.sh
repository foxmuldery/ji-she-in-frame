#!/usr/bin/env bash
# Simulated-player study: N playthroughs of the real state machine.
#   ./dev/sim.sh          # 1000 runs (default)
#   ./dev/sim.sh 300      # quick pass
# Prints completion rate, endings, issue histogram, duration and per-chapter
# medians. See dev/sim/player_sim.js for the bot + chaos-input model.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
RUNS="${1:-1000}"
[[ -x "$CHROME" ]] || { echo "FAIL: Chrome not found at $CHROME"; exit 1; }

OUT="$(mktemp -t ji_sim_XXXXXX)"
"$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --use-angle=swiftshader --ignore-gpu-blocklist \
  --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir="$(mktemp -d -t ji_sim_profile_XXXXXX)" \
  --virtual-time-budget=1800000 --dump-dom \
  "file://${ROOT}/index.html?nointro=1&sim=${RUNS}" 2>/dev/null > "$OUT"

python3 - "$OUT" <<'PY'
import re,html,json,sys
src=open(sys.argv[1]).read()
m=re.search(r'data-sim="([^"]+)"',src)
if not m:
    print('FAIL: harness produced no data (title:',
          (re.search(r'<title>([^<]*)</title>',src) or ['','?'])[1],')')
    sys.exit(1)
d=json.loads(html.unescape(m.group(1)))
ok=sum(v for k,v in d['outcomes'].items() if k in ('help','film','bad','BAD_ENDING'))
print(f"runs        {d['runs']}  ({d['ms']} ms simulated)")
print(f"completion  {ok}/{d['runs']}  {100*ok/d['runs']:.2f}%")
print("endings     " + json.dumps(d['outcomes'],ensure_ascii=False))
print("duration    " + json.dumps(d['duration']))
print("per-chapter " + json.dumps(d.get('segmentMedian',{})))
print("battery     " + json.dumps(d.get('battery',{})))
if d['issueCount']:
    print("issues")
    for k,v in sorted(d['issueCount'].items(), key=lambda kv:-kv[1]):
        print(f"  x{v:<4} {k}")
else:
    print("issues      none")
for r in d.get('sample',[])[:4]:
    print(f"  sample seed {r['seed']} {r['outcome']}: {r['issues']}")
PY
