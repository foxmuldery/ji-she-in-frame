# Real-key E2E

`./dev/e2e/run.sh` plays the game to each ending with **real key events** and
asserts the ending card. It is wired into `./dev/verify.sh`.

## What "real key" means here

- Every input is a `keydown` / `keyup` / `keypress` `KeyboardEvent` dispatched to
  `window`, so the game's own handlers run: `inputLock`, `caseOpen`, `paused`,
  `review`, `transition`, mobile/desktop guards, battery checks.
- Decisions are made only from text that is on screen — `#prompt`, `#subtitle`,
  `#chapterHud`, `#case`. No test reads `state.ritual`, `state.hunt`, etc. to
  decide what to press, and nothing assigns to `state` to skip a puzzle.
- The clock is virtual: the harness advances `state.time` and `tickJobs()` like
  the frame loop does, so `later()` callbacks and the DV scan timer behave
  normally. Speed is the only thing shortened; rules are not.
- The assertion is the **ending card** (`#endTitle` text), not an internal flag.

## Coverage

| spec | path it exercises | expected |
| --- | --- | --- |
| `?e2e=help` | full five passes, corridor nameplate, phone, hand raise, walk to her | `你走过去了。` |
| `?e2e=film` | same, then raise the DV a second time instead of walking | `你一直在拍她。` |
| `?e2e=bad` | first pass, place 甲 on purpose three times | `她替你摆好了。` |

Each run also fails if the page threw (`window.onerror`) or if the ending text
is the pre-set placeholder, which catches "the card never rendered" regressions.

## Run

```bash
./dev/e2e/run.sh              # all three
./dev/e2e/run.sh film         # one
```

Add a spec by extending `E2E_OK` / `END_TITLE` in `dev/sim/naive_sim.js`; the
scripted player lives there because the batch simulator and the gate share the
same chapter handlers.
