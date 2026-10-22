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

## The ending card alone is not enough

A regression that skipped a pass could still land on the same card, so each
playthrough also has to show the whole chain actually happened. `state.mile` is
an append-only record written at the moment each milestone fires (chapter entry
resets `ch3FrameOk` and drops `state.hide`, so the live fields cannot answer
this at the ending):

| counter | written when | help / film require |
| --- | --- | --- |
| `rituals` | altar accepted the layout | ≥ 1 |
| `hunts` | third pass: she was found | ≥ 4 |
| `pass3Anomalies` | third pass: anomaly photographed | ≥ 3 |
| `pass3Frames` | third pass: the closed-eye frame was found | ≥ 1 |
| `pass4HideRounds` | fourth pass: a round survived | ≥ 4 |
| `pass5FinalPhoto` | she was photographed | 1 |
| `corridorPhone` | the corridor phone was answered | 1 |
| `darkroomSplice` | the tape was spliced in act 2 | 1 |
| `darkroomPrint` | the frame was printed in act 2 | 1 |
| `ritualLoops` | wrong altar layouts | `bad` requires ≥ 3 |

`data-e2e` on `<body>` carries the counters, per-chapter entry times and dwell,
so a failure names the missing link instead of just "wrong title".

## Run

```bash
./dev/e2e/run.sh              # all three
./dev/e2e/run.sh film         # one
```

Add a spec by extending `E2E_OK` / `END_TITLE` in `dev/sim/naive_sim.js`; the
scripted player lives there because the batch simulator and the gate share the
same chapter handlers.
