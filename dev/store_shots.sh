#!/usr/bin/env bash
# Regenerate the store screenshots that depend on scene rendering.
#
#   ./dev/store_shots.sh                # all of them
#   ./dev/store_shots.sh 03p_corridor 10_act2_darkroom
#
# Every shot is a deterministic headless capture at 1280×720 with the game's own
# `?advance=` fast-forward, so re-running after a rendering change produces the
# same frame the player sees — no hand-taken screenshots that drift from the
# build. HUD-only shots (pause / credits / title) are not touched here; at
# 1280×720 the UI scale is 1 by definition.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT="$ROOT/store"

shot(){
  local name="$1" params="$2"
  "$CHROME" --headless=new --no-sandbox --enable-unsafe-swiftshader \
    --use-angle=swiftshader --ignore-gpu-blocklist \
    --allow-file-access-from-files --disable-web-security --mute-audio --hide-scrollbars \
    --window-size=1280,720 --user-data-dir="/tmp/ji_shot_${name}_$$" \
    --virtual-time-budget=12000 --screenshot="$OUT/${name}.png" \
    "file://${ROOT}/index.html?nointro=1&${params}" >/dev/null 2>&1
  printf '  %-20s %s\n' "$name.png" "$params"
}

want=("$@")
pick(){ # run a shot only when it was requested (all when nothing requested)
  [[ ${#want[@]} -eq 0 ]] && return 0
  for w in "${want[@]}"; do [[ "$w" == "$1" ]] && return 0; done
  return 1
}

echo "== store shots =="
pick 03p_corridor    && shot 03p_corridor    'corridor=1&depth=0.56&look=1&advance=6'
pick 10_act2_darkroom && shot 10_act2_darkroom 'act2=bench&advance=5'
pick 10b_act2_splice && shot 10b_act2_splice 'act2=splice&advance=5'
# The doorway shot at the very end of act 2 is nearly black, which reads as a
# broken screenshot rather than an atmosphere. Shoot the beat instead: the room
# after the join, where the role label has changed to 谢雨洁（重建）.
pick 10c_act2_back   && shot 10c_act2_back   'act2=back&advance=6'
pick 03h_chapter2    && shot 03h_chapter2    'chapter=2&advance=6'
pick 03i_hunt        && shot 03i_hunt        'chapter=2&huntcam=1&huntpos=1&advance=6'
pick 03l_hide        && shot 03l_hide        'chapter=4&advance=6'
pick 03m_hide_scan   && shot 03m_hide_scan   'chapter=4&huntcam=1&huntpos=1&advance=6'
pick 06_pause        && shot 06_pause        'shelf=pause&advance=4'
pick 07_credits      && shot 07_credits      'shelf=credits&advance=4'
pick 08_end          && shot 08_end          'end=help&advance=8'
echo "done — review before publishing"
