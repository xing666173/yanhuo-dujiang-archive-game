# Task 8 Report: Resilience, Accessibility, Visual QA, and Release

## Status

DONE. Task 8 is implemented and verified on `feature/yanhuo-3d-story-game` from baseline `287b9d437d266910cdcb285f6ca14b4745d175a0`.

## Implementation

- Moved the Three.js world behind WebGL preflight. `game/main.mjs` now imports `game/render/world.mjs` dynamically only after `detectWebGL()` succeeds.
- WebGL failure renders the exact message `当前设备无法启动 3D 场景` and a real relative `返回成果页` link. The failure path does not request or initialize the world module.
- Portrait sprites retain the approved successful rendering. A failed sprite probe now sets `data-portrait-fallback="true"` and shows a reed-green named silhouette in the same fixed portrait column.
- Audio remains optional. Missing `AudioContext` does not block dialogue. Audio unlock listeners now survive early gestures while the dynamic world import is pending.
- Visibility loss explicitly stops the world and quality RAF loop, clears movement, pauses dialogue autoplay, and suspends audio. Visibility restore starts each subsystem once and resumes safely.
- Added a deterministic auto-quality monitor. Only `auto` mode can downgrade, only after average FPS remains below 26 for a continuous 5000 ms window, and only once per session. Recovery, explicit high/low, and visibility reset restart or disable the window. The exact accessible announcement is `已切换为流畅画质`.
- Preserved live explicit quality switching, the 18-degree camera contract, scene disposal, portraits, wetland framing, echo treatment, and summary behavior.
- Fixed the visual defect found during original-resolution inspection: the desktop `E · 互动` prompt could overlap the third convergence choice. It is now hidden whenever dialogue is active.
- Fixed Playwright release concurrency at two Edge workers. Six simultaneous 3D flows exhausted local CPU/GPU time and caused completed journeys to exceed the old 30-second per-test limit; two-worker execution preserves the timeout and passes reliably.
- Replaced README content with the exact Task 8 release, preview, test, publishing, content, and Three.js license information.

## Preflight-Resolution Behavior Tests

No test concatenates or regex-scans runtime source for URLs, replacement characters, or old terminology.

- Rendered homepage and all covered game views assert visible DOM text and accessible names contain no U+FFFD.
- All covered views assert visible copy excludes `证据匹配`, `档案修复`, and `修复档案`.
- Homepage/game traversal records every browser request and asserts the request origin is exactly `http://127.0.0.1:4173`. Remote audio requests are rejected.
- Navigation uses real `开始旅程`, `教师浏览`, chapter, and `返回成果页` links/buttons.
- Forced WebGL failure records requests and proves `game/render/world.mjs` was never requested.
- `release-contract.unit.test.cjs` contains only README content checks and filesystem asset-budget checks.

## RED/GREEN Evidence

1. Release contract RED: README heading expected `# 雁火渡江：夏日回响` but found the old archive-showcase heading. Asset budgets already passed. GREEN after the exact README replacement.
2. WebGL RED: browser received the old three-dimensional-scene wording. GREEN after exact fallback copy and dynamic world import; request log proved no world request and the return link navigated home.
3. Portrait RED: failed local sprites left no `data-portrait-fallback`. GREEN after the named silhouette fallback; dialogue still advanced.
4. Quality-unit RED: `createAutoQualityMonitor` was absent. GREEN: 6/6 quality tests passed, including continuous five-second low FPS, one-shot behavior, explicit high/low exclusion, recovery, and visibility reset.
5. Quality-browser RED: simulated sustained 25 FPS remained high after five seconds. GREEN: switched once to low and announced `已切换为流畅画质`.
6. Visibility/audio RED: dynamic import allowed a `{ once: true }` unlock listener to disappear before the audio manager existed. Browser diagnostics showed `AudioContext` available but zero constructions. GREEN after retaining listeners until a real unlock attempt; frame stop/restart, autoplay pause/resume, one suspend, and safe resume passed.
7. Visual-overlap RED: original desktop choice screenshot showed `E · 互动` over the third option. Added real interaction-prompt/dialogue/choice rectangle assertions; both intersections were `true`. GREEN after the dialogue-active CSS rule; both became `false`.
8. Initial full-suite run: 65 unit tests passed, while two prior full-story tests timed out under six-worker contention after already reaching the completion view. Focused rerun passed both in about 17 seconds. Full E2E with two workers passed, so `workers: 2` was committed to configuration.

## Final Verification

- `npm test`: PASS.
  - Unit: 65 passed, 0 failed.
  - Playwright: 21 passed, 7 intentional project-specific skips, 0 failed, using installed Microsoft Edge.
- `git diff --check`: PASS, no whitespace errors.
- Release budgets:
  - Homepage: 305,296 bytes (0.291 MiB), below 12 MiB.
  - Game assets excluding vendored Three.js: 2,487,792 bytes (2.373 MiB), below 25 MiB.
- Preview server: stopped; no listener on port 4173.
- Runtime requests: same-origin only in all covered traversals; no remote audio.
- Screenshots and JSON evidence remain under `test-results` only and are not committed.

## Screenshot Evidence

All 12 screenshots below were opened and inspected at original resolution after the final `npm test`.

Homepage:

- `test-results/visual-regression-homepage-0c137--clean-and-visually-bounded-desktop/task-8-homepage-desktop-1440x900.png` - 1440 x 900. First viewport clearly identifies the game, shows exactly two men and one woman, and exposes the next section.
- `test-results/visual-regression-homepage-0c137--clean-and-visually-bounded-mobile-landscape/task-8-homepage-mobile-390x844.png` - 390 x 844. All three characters remain visible, text/buttons fit, and the next section is visible.

Desktop game (`test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/`):

- `task-8-activity-room-desktop-1440x900.png` - stable full-bleed room framing; player, marker, furniture, and NPCs are coherent.
- `task-8-reeds-scene-desktop-1440x900.png` - nonblank wetland; boardwalk, reeds, player, and hotspot actors are separated.
- `task-8-normal-dialogue-desktop-1440x900.png` - approved Lin Xia portrait preserved; portrait, speaker, line, and controls do not overlap.
- `task-8-choice-dialogue-desktop-1440x900.png` - all choices fit; the repaired interaction prompt no longer appears over choices.
- `task-8-historical-echo-desktop-1440x900.png` - full echo sentence is readable; muted crimson treatment clearly distinguishes the echo from reality.

Mobile landscape game (`test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/`):

- `task-8-activity-room-mobile-landscape-844x390.png` - full-bleed room and touch controls are correctly framed.
- `task-8-reeds-scene-mobile-landscape-844x390.png` - boardwalk/player remain centered; touch controls do not cover scene targets.
- `task-8-normal-dialogue-mobile-landscape-844x390.png` - portrait and wrapped line fit without clipping or control overlap.
- `task-8-choice-dialogue-mobile-landscape-844x390.png` - three choices remain in bounds; no touch/dialogue overlap.
- `task-8-historical-echo-mobile-landscape-844x390.png` - complete echo text wraps cleanly and remains visually distinct.

Canvas pixel evidence for the 10 game screenshots:

| View | Desktop spread | Mobile spread |
| --- | ---: | ---: |
| Activity room | 206 | 214 |
| Reeds scene | 165 | 228 |
| Normal dialogue | 206 | 214 |
| Choice dialogue | 158 | 227 |
| Historical echo | 148 | 222 |

Every spread is greater than 24 and every sampled canvas had opaque ratio 1.000. In all 10 evidence files, dialogue/choices, portrait/speaker, touch/dialogue, interaction/dialogue, and interaction/choices intersections were `false`. Every visible button had nonzero width and height. The longest production option, `用一个长镜头保留现场的水声和距离。`, formed two lines at a constrained 180 px width with `scrollWidth=clientWidth=178` and `white-space: normal`. Every game view satisfied `document.documentElement.scrollWidth <= window.innerWidth`.

## Files Changed

- `README.md`
- `game/index.html`
- `game/main.mjs`
- `game/render/quality.mjs`
- `game/styles.css`
- `game/ui/dialogue-view.mjs`
- `playwright.config.mjs`
- `tests/e2e/game-canvas.spec.mjs`
- `tests/e2e/visual-regression.spec.mjs`
- `tests/unit/quality.unit.test.mjs`
- `tests/unit/release-contract.unit.test.cjs`
- `.superpowers/sdd/2026-07-26-yanhuo-3d-story-game-mvp/task-8-report.md`

## Self-Review

- All Task 8 exact strings and threshold values are present.
- World import occurs only after WebGL detection.
- Auto downgrade cannot override explicit high/low and cannot repeat.
- Visibility restore is idempotent at the public world/audio/dialogue boundaries.
- Audio unavailable and portrait unavailable paths do not block story nodes.
- No source-scan assertions were introduced.
- Runtime remains relative-URL, same-origin, local-only, and GitHub Pages-safe.
- No gradient, decorative orb, nested-card, viewport-font, negative-letter-spacing, or radius-over-8 change was introduced.
- Existing two-men/one-woman composition, portraits, wetland, echo, summary, 18-degree camera, and disposal contracts remain covered and unchanged.
- No screenshot binary is staged or committed.
- The pre-existing modified Task 2 report was not edited, reverted, staged, or included in the Task 8 commit.

## Concerns

No release blocker remains. The seven Playwright skips are intentional mobile-project exclusions for desktop-only resilience checks, not missing coverage. Screenshot paths are ephemeral Playwright output and will be regenerated by the next E2E run.

---

# Fix Round 1

## Findings And Implementation

1. Pending import/pagehide race: `game/main.mjs` now owns a disposed flag and initialization generation. `pagehide` invalidates the generation before teardown. The post-import boundary and every world/audio/session creation or attachment point recheck the generation; a resource created during invalidation is disposed immediately. Stale callbacks and the error path cannot mutate the destroyed shell/dialogue, start RAF/audio, or show fallback. Teardown also removes pending audio-unlock listeners and clears resource references.
2. Visibility idempotence: the runtime tracks the last handled visibility state. Repeated hidden or visible events are ignored, while one genuine transition still pauses dialogue autoplay, stops/restarts both RAF loops, clears movement, and suspends/resumes audio.
3. Real visual paths: activity room and reeds captures now use `?mode=teacher` and the visible `出发准备` / `白洋淀木栈道` chapter buttons. No `testHud`, `scene` query, or mutable/internal hook is used for release screenshots.
4. Production wrapping: choice buttons now contain a normal label span with a stable reading width and `overflow-wrap: anywhere`. Tests leave production styles untouched and measure the actual button, label line boxes, scroll/client dimensions, line height, white-space, and parent containment.
5. Accessible copy: forbidden terminology is checked in collected `aria-label`, `aria-labelledby`, `alt`, and `title` text as well as `body.innerText`; both collections also reject U+FFFD.
6. Inspection repair: original-size mobile inspection exposed a disabled skip button intersecting scene controls in the choice state. A focused rectangle regression reproduced the overlap; choice states now omit that unavailable skip action. Activity screenshots also wait for the complete rendered line instead of capturing mid-typewriter.

The world, camera rig, scene builders, portraits, wetland assets, echo timing/treatment, summary logic, and explicit live-quality behavior were not changed.

## Focused RED/GREEN Evidence

- Pending import RED: with `game/render/world.mjs` held, `pagehide` followed by release produced 76 late RAF requests. GREEN: baseline and post-release remained at 0 RAF and 0 AudioContext constructions, no listener was added after `pagehide`, WebGL request count did not increase, no scene became ready, dialogue stayed empty, and destroyed runtime controls stayed absent.
- Visibility RED: two identical hidden events produced two audio suspends. GREEN: one hidden transition produced exactly 2 RAF cancellations and 1 suspend; two identical visible events produced exactly 2 initial RAF requests and 1 resume. Final audio totals were exactly 1 suspend and 2 resumes including initial unlock.
- Accessible-copy RED: an accessible-only `aria-label="档案修复"` escaped the guard. GREEN: the guard rejected the injected accessible name.
- Wrapping RED: the unchanged production longest option had 1 line at 1440 x 900. GREEN on both targets: 2 lines, button/client/scroll `732x68` desktop and `554x68` mobile, label width 240, text height 45, line height 24, `white-space: normal`, and contained `true`.
- Mobile overlap RED: skip bounds `750-782` intersected runtime-control bounds `636-762`. GREEN: `skipRuntimeControlsIntersect=false`; all other monitored overlap pairs also remained false.
- Real-route GREEN: both scene captures passed after normal teacher chapter button navigation. The complete player journey still reached convergence through dialogue, choice, movement, and all three hotspot interactions.

## Preflight-Resolution Coverage

- Runtime source is not concatenated or regex-scanned.
- Rendered visible and accessibility text is checked for U+FFFD and forbidden old terminology in homepage, activity, reeds, normal dialogue, convergence choice, and echo views.
- Browser request logs cover homepage navigation, both teacher chapters, and the complete player route; all requests are same-origin/local and no remote audio is requested.
- Homepage navigation uses `开始旅程` and `教师浏览`; scene navigation uses chapter buttons.
- Filesystem asset budgets and README release content remain covered by `release-contract.unit.test.cjs`.

## Final Verification

- Final `npm test`: PASS.
- Unit: 65 passed, 0 failed. This includes the exact 18-degree camera contract and repeated scene shadow-disposal contract.
- Playwright with installed Microsoft Edge: 23 passed, 9 intentional project-specific skips, 0 failed.
- Existing live explicit-quality test passed without player movement or blanking; portrait failure, WebGL fallback, audio degradation, complete player flow, teacher flow, echo, and summary coverage passed.
- `git diff --check`: PASS.
- Port 4173 after verification: no listener. No preview server remains.
- Screenshots and evidence are only in ignored `test-results`; no binary is staged.

## Final Screenshot Inspection

All 12 final screenshots were opened individually at original resolution after the final full suite.

| Screenshot | Dimensions | Original-resolution observation |
| --- | --- | --- |
| `test-results/visual-regression-homepage-0c137--clean-and-visually-bounded-desktop/task-8-homepage-desktop-1440x900.png` | 1440 x 900 | Exact composition is two men and one woman; title, actions, subjects, and next-section hint are unobscured. |
| `test-results/visual-regression-homepage-0c137--clean-and-visually-bounded-mobile-landscape/task-8-homepage-mobile-390x844.png` | 390 x 844 | The same exact two-men/one-woman composition remains visible; copy and actions fit and the next section is exposed. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-activity-room-desktop-1440x900.png` | 1440 x 900 | Approved Lin Xia portrait and room framing are unchanged; the complete line is present and controls are separate. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-activity-room-mobile-landscape-844x390.png` | 844 x 390 | Complete line wraps cleanly; portrait, room, and controls fit without clipping. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-reeds-scene-desktop-1440x900.png` | 1440 x 900 | Approved wetland/boardwalk framing remains detailed, centered, and unobstructed. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-reeds-scene-mobile-landscape-844x390.png` | 844 x 390 | Player, boardwalk, reeds, hotspots, and touch controls remain distinct. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-normal-dialogue-desktop-1440x900.png` | 1440 x 900 | Portrait, full dialogue line, and controls are crisp with no overlap. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-normal-dialogue-mobile-landscape-844x390.png` | 844 x 390 | Dialogue wraps to two lines without covering portrait or scene controls. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-choice-dialogue-desktop-1440x900.png` | 1440 x 900 | Production choices wrap naturally; all three choices fit and the unavailable skip action is absent. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-choice-dialogue-mobile-landscape-844x390.png` | 844 x 390 | All choices remain in bounds; the prior skip/runtime-control collision is gone. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-desktop/task-8-historical-echo-desktop-1440x900.png` | 1440 x 900 | Approved muted-crimson echo treatment and complete sentence remain intact. |
| `test-results/visual-regression-game-vie-72e41-ing-copy-and-local-requests-mobile-landscape/task-8-historical-echo-mobile-landscape-844x390.png` | 844 x 390 | Echo copy wraps cleanly and the treatment remains visually distinct. |

Canvas evidence for the ten game screenshots:

| View | Desktop luminance spread | Mobile luminance spread | Opaque ratio |
| --- | ---: | ---: | ---: |
| Activity room | 206 | 214 | 1.000 |
| Reeds scene | 166 | 228 | 1.000 |
| Normal dialogue | 206 | 214 | 1.000 |
| Choice dialogue | 158 | 216 | 1.000 |
| Historical echo | 162 | 217 | 1.000 |

Every spread is greater than 24. Across all ten evidence files, line/choices, portrait/speaker, touch/dialogue, interaction/dialogue, interaction/choices, and skip/runtime-controls intersections are all `false`; every visible button has nonzero dimensions; every game document has no horizontal overflow.

## Fix Files

- `game/main.mjs`
- `game/styles.css`
- `game/ui/dialogue-view.mjs`
- `tests/e2e/game-canvas.spec.mjs`
- `tests/e2e/visual-regression.spec.mjs`
- `.superpowers/sdd/2026-07-26-yanhuo-3d-story-game-mvp/task-8-report.md`

## Fix Self-Review And Concerns

- Every review finding has a focused regression and passing final coverage.
- `pagehide` invalidates before teardown; no post-await stale initialization can attach resources or mutate destroyed UI.
- Repeated visibility events are idempotent and exact increments are asserted.
- Release screenshots use only legitimate user controls and preserve the approved portraits, wetland, echo, and summary treatment.
- The exact two-men/one-woman homepage composition is preserved and visually confirmed at both homepage targets.
- Camera 18-degree and repeated disposal contracts passed unchanged.
- The protected Task 2 report was not edited, staged, reverted, or deleted.
- No release blocker remains. The 9 skips are intentional duplicate mobile exclusions for desktop-only resilience cases.
