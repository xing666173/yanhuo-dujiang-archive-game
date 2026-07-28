# 3D Visual, Model, and Interface Upgrade Design

## Purpose

Upgrade the teacher-facing GitHub Pages game from a geometric prototype to a polished
stylized 3D experience without changing its routes, story progression, save format, or
three field-task rules.

The finished game must:

- Keep the named team at exactly two men and one woman: Chen Yu, Gu Yan, and Lin Xia.
- Preserve keyboard, pointer, and touch play.
- Load entirely from the published repository with no runtime dependency on third-party
  model hosts.
- Remain playable when any optional model asset fails.
- Fit a normal school-network browser session and mid-range phone.

## Design Read

This is a redesign-overhaul of a 3D social-practice story game for teacher review. The
visual language is documentary-cinematic rather than fantasy, with a restrained wetland
palette and clearly staged character interactions.

- `DESIGN_VARIANCE: 7`
- `MOTION_INTENSITY: 6`
- `VISUAL_DENSITY: 4`
- Theme: dark translucent interface over a daylight 3D scene
- Accent: one muted cinnabar interaction color
- Status color: warm reed gold
- Radius system: 4 px controls, 6 px framed panels

## Existing-State Audit

### Preserve

- The homepage and `/game/` route.
- The story, three field tasks, chapter summary, and local save.
- The full-screen Three.js canvas.
- The efficient instanced reeds and lotus fields.
- Existing ACES tone mapping, sRGB output, fog, water animation, quality settings, and
  reduced-motion behavior.
- Existing accessibility names, live task feedback, keyboard controls, and trusted touch
  tests.

### Retire

- Human bodies assembled from spheres, cylinders, and boxes.
- Sphere-cluster tree canopies in the near and middle distance.
- Large opaque task frames that cover important scenery.
- Uniform charcoal rectangles with weak hierarchy.
- Symbol-only controls whose meaning is not obvious without prior knowledge.
- Repeated vegetation silhouettes with little foreground, middle-ground, or horizon
  separation.

### Root Causes

1. Characters have no skeleton, skinning, hand shape, facial planes, or authored motion.
2. Trees use one procedural silhouette at every distance.
3. Character and scene materials do not share a deliberate lighting response.
4. The HUD treats every state as an equally heavy panel.
5. Visual regression checks protect bounds but do not yet enforce model readiness,
   triangle budgets, or asset-request failures.

## Selected Asset Strategy

All selected assets are CC0 and may be modified and redistributed. A local copy of each
source license will ship with the game.

### Characters

Source:

- Quaternius Ultimate Modular Men Pack:
  https://quaternius.com/packs/ultimatemodularcharacters.html
- Quaternius Ultimate Modular Women Pack:
  https://quaternius.com/packs/ultimatemodularwomen.html

Selected source models:

| Character | Source model | Triangles | Source animations |
| --- | --- | ---: | ---: |
| Chen Yu | Adventurer | 10,202 | 24 |
| Gu Yan | Casual_2 | 5,776 | 24 |
| Lin Xia | Casual | 6,424 | 24 |

The source files contain embedded geometry and color materials with no external textures.
Only `Idle`, `Walk`, `Interact`, and `Wave` will remain in production GLB files. Materials
will be recolored to the existing character palette, keeping skin and hair distinct.

The current procedural character remains the fail-safe implementation. Model loading
failure must not enter the WebGL fallback or block a story node.

### Environment

Source:

- Quaternius Ultimate Stylized Nature Pack:
  https://quaternius.com/packs/ultimatestylizednature.html

Selected source models:

- `BirchTree_1`
- `BirchTree_3`
- `Bush_Large`

These assets are used only for authored near-bank and middle-ground groups. Procedural
instancing remains responsible for distant tree mass, reeds, lotus leaves, and most
ground cover. The original 22 MB tree normal map will not ship; the tree bark and leaf
textures will be resized and embedded into optimized GLB files.

## Model Processing

Model processing is an offline development step:

1. Read the original glTF.
2. Remove unused animation clips.
3. Deduplicate and prune unused accessors and nodes.
4. Pack output as GLB.
5. Resize nature textures to the smallest visually acceptable dimensions.
6. Preserve mesh names and skeleton bone names needed by runtime code.
7. Record source URL, source file, license, triangle count, animation names, and output
   size in `game/assets/models/ATTRIBUTION.md`.

Budgets:

- Combined character GLB files: at most 4.5 MB.
- Combined environment GLB files: at most 1.5 MB.
- Total new model payload: at most 6 MB.
- Any single GLB file: at most 2 MB.
- Named-character triangles visible at once: at most 25,000.
- Additional environment draw calls on high quality: at most 18.
- Low quality may omit imported bushes and reduce imported tree instances.

## Runtime Architecture

### `game/data/model-assets.mjs`

Defines immutable local asset records:

```js
{
  id,
  kind: 'character' | 'environment',
  url,
  sourceUrl,
  license: 'CC0-1.0',
  animations,
  triangleCount,
  maxBytes
}
```

### `game/render/model-library.mjs`

Owns the `GLTFLoader`, source scenes, source materials, and source animation clips.

Public interface:

```js
await loadModelLibrary({ assetRecords, loader, onProgress })
library.has(id)
library.createCharacter(id, options)
library.createEnvironment(id, options)
library.dispose()
```

Character instances use `SkeletonUtils.clone`, an `AnimationMixer`, and a small action
state machine. Environment instances use ordinary deep clones and share immutable source
geometry and textures.

Every returned instance has:

```js
{
  group,
  update({ delta, elapsed, movementMagnitude, action }),
  setQuality(quality),
  play(action),
  dispose()
}
```

### Loading and Failure Policy

`initializeGame()` attempts to load the model library before creating the world. A
rejected individual asset is logged and omitted from the library. `createWorld()` still
starts with the resulting partial library.

`scene-builder.mjs` asks the library for an imported instance first and falls back to
`createCharacterModel()` when unavailable. Scene loads and live quality changes remain
synchronous because the library is already settled before world creation.

The model library is disposed only when the world is disposed. Scene disposal removes
instances and mixers but does not dispose shared source geometry.

## Character Presentation

- Chen Yu uses the explorer body and backpack, recolored to dark moss with a cinnabar
  camera accent.
- Gu Yan uses the casual body, recolored to muted blue-grey and charcoal.
- Lin Xia uses the casual woman body, recolored to warm grey, deep green, and cinnabar.
- Existing camera, notebook, and recorder props are rebuilt as compact meshes and
  attached to the named wrist bone.
- NPCs play an authored idle loop and use `Interact` or `Wave` when their story hotspot
  becomes active.
- The player keeps a neutral non-story avatar. It uses an imported character only when a
  visually distinct model is available; otherwise the improved procedural fallback is
  retained. It must never be mistaken for a fourth named team member.

## Environment and Rendering

### Wetland Composition

- Foreground: weathered boardwalk, a few framed reeds, lotus leaves, and subtle water
  reflections.
- Middle ground: three named characters, imported birches, imported bushes, and task
  markers integrated into the deck.
- Horizon: procedural tree mass, fog, and low-contrast reed silhouettes.
- Landmark: one distant low-profile fishing boat built from existing primitive geometry
  to reinforce Baiyangdian without adding another external pack.

### Lighting

- Keep ACES filmic tone mapping and sRGB output.
- Rebalance exposure to preserve sky and skin highlights.
- Use a warm directional key, cool hemisphere fill, and restrained rim light.
- High quality keeps soft character and boardwalk shadows.
- Low quality keeps character shape through hemisphere and rim lighting even with
  shadows disabled.

### Materials and Motion

- Imported materials remain rough, non-metallic, and slightly desaturated.
- Water color shifts toward blue-green with a brighter grazing-angle sheen.
- Reeds retain vertex wind; imported tree foliage receives a small deterministic sway
  only on high quality.
- Reduced motion freezes decorative foliage and water displacement but keeps essential
  character state changes.

## Interface Redesign

The interface uses native HTML and CSS and keeps the existing DOM and controller
boundaries.

### Main Menu

- Keep the 3D scene full bleed.
- Place the title in the lower-left safe area and the actions in a narrow right rail.
- Use clear icon-plus-text commands rather than anonymous symbols.
- The title remains the game name; the social-practice context stays supporting copy.

### Runtime HUD

- Replace scattered square buttons with one compact top-right tool group.
- Use familiar pause, settings, history, and autoplay icons from a locally vendored icon
  set or Unicode symbols with explicit accessible names.
- Keep the scene title as a small top-left location label.
- Interaction prompts show both the action and current character name.

### Dialogue

- Use a wide lower-third frame with the portrait anchored outside the text block.
- Keep at most four lines of dialogue visible.
- Choices appear as a vertically spaced command list inside the same lower-third region,
  not as nested cards.
- History remains an overlay with a solid contrast fallback when backdrop blur is
  unavailable.

### Field Tasks

- Keep the live 3D scene visible.
- Reduce the task header height and move instructions to a thin lower status strip.
- Preserve stable stage dimensions and all existing task hit areas.
- Result stars remain centered but use a restrained one-time entrance animation.

### Mobile

- Use `100dvh` and safe-area insets.
- Keep controls outside the dialogue and task status regions.
- Portrait mode uses a compact top bar and bottom interaction zone.
- Landscape mode reserves at least 250 px of unobstructed scene width.
- No text, button, task marker, or joystick may overlap at 390x844 or 844x390.

## Accessibility

- Preserve all existing accessible names and live regions.
- Loading progress uses `aria-live="polite"` without announcing every byte.
- Model failure is not announced as an error when the fallback is playable.
- Every icon-only control has a visible tooltip and an accessible name.
- `prefers-reduced-motion` and the in-game reduced-motion setting both disable
  decorative UI entrances and foliage sway.
- Contrast must meet WCAG AA for visible UI text.

## Testing and Debugging

### Unit Contracts

- Asset records use local URLs, CC0 metadata, size ceilings, and allowed animation names.
- Production GLB files remain under the declared size and triangle budgets.
- The model library returns partial success when one asset fails.
- Skeleton clones do not share skeleton state.
- Character action transitions stop old actions and preserve a playable idle.
- Scene building prefers imported assets and falls back without throwing.
- Shared assets are disposed exactly once.

### Browser Tests

- The normal journey loads all three named imported characters.
- A forced model request failure keeps the game playable with the procedural fallback.
- Player movement drives walk animation and stops at idle.
- Dialogue and task transitions do not leave animation input active.
- High and low quality preserve character count and game state.
- All runtime model requests are same-origin and return 200.

### Visual and Performance Tests

- Capture menu, dialogue, wetland exploration, each task, result, and chapter summary at
  1440x900, 844x390, and 390x844.
- Confirm nonblank canvas pixels, character silhouettes, scene bounds, and UI overlap.
- Record draw calls, triangles, asset readiness, and frame-time samples in canvas
  diagnostics.
- Reject a release if the model payload exceeds 6 MB, a required character is absent,
  or the 95th-percentile frame time exceeds the existing quality monitor threshold.

## Rollout

1. Commit the design and implementation plan.
2. Add asset and loader contracts with failing tests.
3. Process and add the selected assets and licenses.
4. Integrate character models and animation.
5. Integrate near-bank nature assets and rendering changes.
6. Redesign the interface with the Taste Skill pre-flight checklist.
7. Run unit, browser, visual, performance, and fallback verification.
8. Review the full branch, merge to `main`, publish, and run the production smoke flow.

