#!/usr/bin/env bash
# Random-player fuzz regression: N seeded playthroughs of the real state machine.
#
#   ./dev/fuzz.sh                 # 1000 runs, seed 20261024
#   ./dev/fuzz.sh 200 12345       # quick pass, different seed base
#   ./dev/fuzz.sh 1000 20261024 tasks/fuzz-round1.json
#
# The browser runs dev/fuzz/fuzz_sim.js (loaded only with ?fuzz=); every run
# picks legal actions from its own RNG, checks invariants each tick, and stops
# on an ending, a 120 s no-progress stall, or the step cap. Exit status is
# non-zero only when the harness itself produced no result.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
RUNS="${1:-1000}"
SEED="${2:-20261024}"
OUTJSON="${3:-}"

[[ -x "$CHROME" ]] || { echo "FAIL: Chrome not found at $CHROME" >&2; exit 1; }
[[ -f dev/fuzz/fuzz_sim.js ]] || { echo "FAIL: dev/fuzz/fuzz_sim.js missing" >&2; exit 1; }

OUT="$(mktemp -t ji_fuzz_XXXXXX)"
trap 'rm -f "$OUT"' EXIT
"$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
  --use-angle=swiftshader --ignore-gpu-blocklist \
  --allow-file-access-from-files --disable-web-security --mute-audio \
  --user-data-dir="$(mktemp -d -t ji_fuzz_profile_XXXXXX)" \
  --virtual-time-budget=600000 --dump-dom \
  "file://${ROOT}/index.html?nointro=1&fuzz=${RUNS}&fuzzseed=${SEED}&chaos=0.1" 2>/dev/null > "$OUT"

python3 - "$OUT" "$OUTJSON" <<'PY'
import re,html,json,sys
src=open(sys.argv[1]).read()
m=re.search(r'data-fuzz="([^"]+)"',src)
if not m:
    title=(re.search(r'<title>([^<]*)</title>',src) or ['','?'])[1]
    print('FAIL: harness produced no result (title:',title,')')
    sys.exit(1)
d=json.loads(html.unescape(m.group(1)))
if len(sys.argv)>2 and sys.argv[2]:
    with open(sys.argv[2],'w') as f:
        json.dump(d,f,ensure_ascii=False,indent=1)
    print('wrote',sys.argv[2])
print(f"runs        {d['runs']}  players {d['playerRuns']}  chaos {d['chaosRuns']}  ({d['ms']} ms)")
print(f"reached     {d['reachedEnding']}/{d['runs']}")
print("endings     "+json.dumps(d['endings'],ensure_ascii=False)+f"  bad {d['badEndings']}")
print(f"players     {d['completedPlayers']}/{d['playerRuns']} help+film"
      f"  ({d['playerCompletionPct']}%)")
print("duration    "+json.dumps(d['duration']))
print(f"min battery {d['minBattery']}")
print("problems    "+json.dumps(d['problemCounts'],ensure_ascii=False))
if d['issueCount']:
    print("issues")
    for k,v in sorted(d['issueCount'].items(), key=lambda kv:-kv[1]):
        print(f"  x{v:<4} {k}")
else:
    print("issues      none")
for r in d.get('sampleFailures',[])[:5]:
    print(f"  sample seed {r['seed']} {r['outcome']}: {r['issues']}")
PY
