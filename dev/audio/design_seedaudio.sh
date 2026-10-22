#!/usr/bin/env bash
# Generate one SFX via running MiniMax Design gateway (seedaudio).
# Usage: ./dev/audio/design_seedaudio.sh <basename> "prompt text"
set -euo pipefail
name="${1:?basename without src_ prefix}"
prompt="${2:?prompt}"
req="/tmp/req_${name}.json"
python3 - <<PY
import json
json.dump({
  "prompt": """$prompt""",
  "backend": "seedaudio",
  "filename": "src_${name}",
  "params": {"sample_rate": "48000", "pitch": "0", "volume": "1", "speed": "1"}
}, open("$req","w"), ensure_ascii=False)
PY
design doctor >/dev/null
curl -sS -X POST http://127.0.0.1:8001/api/generate/speech \
  -H 'Content-Type: application/json' --data-binary @"$req"
echo
echo "WAV: ~/Library/Application Support/@hilo/desktop/output_files/src_${name}.wav"
