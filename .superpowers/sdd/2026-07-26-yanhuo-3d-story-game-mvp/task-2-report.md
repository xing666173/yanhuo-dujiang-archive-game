# Task 2 Report: Story Game Homepage Entry

## Implementation

Replaced the JavaScript-rendered archive homepage with semantic static HTML for the story-game entry. The new page provides the required `#entry`, `#team`, `#route`, and `#creation-note` sections, and keeps both game destinations as relative links:

- `game/?mode=new`
- `game/?mode=teacher`

Removed `app.js`. Existing unrelated historical binary assets remain unchanged.

Created `assets/generated/hero-summer-echo.jpg` from the approved source with bundled Sharp. Output metadata is 1920 x 1081 JPEG at quality 86, 295,280 bytes.

## Files

- `index.html`: static entry markup, semantic regions, navigation, skip link, team facts, route, creation note, and relative game links.
- `styles.css`: dark documentary visual system, responsive layout, focus states, reduced-motion rules, and restrained entrance motion.
- `app.js`: deleted.
- `assets/generated/hero-summer-echo.jpg`: optimized approved hero artwork.
- `tests/unit/homepage-contract.unit.test.cjs`: Edge browser contract test against the real local static server.
- `.superpowers/sdd/2026-07-26-yanhuo-3d-story-game-mvp/task-2-report.md`: this report.

## RED

Command:

```powershell
node --test tests/unit/homepage-contract.unit.test.cjs
```

Output:

```text
✖ homepage presents the story game and removes the old repair theme (4427.5729ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5092.9936

AssertionError [ERR_ASSERTION]: Got unwanted rejection.
Actual message: "locator.waitFor: Timeout 3000ms exceeded.
waiting for getByRole('heading', { name: '雁火渡江：夏日回响', level: 1 }) to be visible"
```

This failed against the old JavaScript homepage because it did not present the story-game title screen.

## GREEN

Focused contract command:

```powershell
node --test tests/unit/homepage-contract.unit.test.cjs
```

Output:

```text
✔ homepage presents the story game and removes the old repair theme (1477.1355ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1838.7352
```

Full unit command:

```powershell
D:\node\npm.cmd run test:unit
```

Output:

```text
> test:unit
> node --test "tests/unit/**/*.unit.test.cjs" "tests/unit/**/*.unit.test.mjs"

✔ homepage presents the story game and removes the old repair theme (1349.1745ms)
✔ serves the homepage and rejects path traversal (57.8186ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1707.5233
```

The homepage contract starts `createStaticServer`, launches installed Edge through `@playwright/test` with `channel: 'msedge'`, and closes the page, browser, and server through test cleanup. It verifies the heading role, all required sections, exact relative links, root-relative URL resolution, no old repair text, no `app.js` request, and a same-origin `200` response for the CSS background image.

## Visual Inspection

Preview command:

```powershell
D:\node\npm.cmd run preview
```

Opened `http://127.0.0.1:4173/` in Edge and captured ignored local evidence:

- `test-results/task-2-home-desktop.png` at 1440 x 1000.
- `test-results/task-2-home-mobile.png` at 390 x 844.

Observed results:

- Desktop: title bounds were x=72, y=461.78, width=542.69, height=183.03. All three faces remain clear on the right. The next section begins at y=890 and its title starts at y=950, leaving a visible lower-fold cue.
- Mobile: title bounds were x=19.5, y=352.07, width=296.02, height=99.81. The three faces remain above the title. The next section begins at y=658.31 and its title starts at y=718.31.
- Both viewports had `scrollWidth` equal to their viewport width, with no horizontal overflow.
- Both buttons resolved to the local project root as `http://127.0.0.1:4173/game/?mode=new` and `http://127.0.0.1:4173/game/?mode=teacher`.

## Copy And Design Pre-Flight

- Design read applied: teacher-review story-game entry, mature documentary-anime imagery, DESIGN_VARIANCE 7, MOTION_INTENSITY 5, VISUAL_DENSITY 4.
- The hero is a full-bleed local bitmap with left-aligned title content and all three people visible on the right.
- The page uses a single dark documentary theme, one crimson interactive accent, 6px control radii, and fixed 88px, 64px, and 48px title sizes at breakpoints.
- The team is arranged as one large lead panel with two stacked members, not an equal three-card row. No member numbers, scroll-cue control, repeated section eyebrows, light-theme inversion, decorative gradient, or ornamental floating cards are present.
- The only motion is a restrained initial content entrance and it is disabled by `prefers-reduced-motion`.
- Skip link and visible keyboard focus states are included.
- Manual source audit: no external `http` or `https` references, no visible em dash or en dash, no CSS gradient, no `section-label` markup, and no team member numbers.
- Hero audit: `app.js` absent; output is 1920 x 1081 and below the 1.5 MB limit.
- `git diff --check` completed with no whitespace errors.

## Concerns

The requested game page is intentionally not implemented in Task 2. The homepage links are verified as correctly relative and local-root resolving, but the destination route remains for the later game task to provide.
