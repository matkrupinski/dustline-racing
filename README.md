# Dustline

A small, single-player Three.js time attack: one car, a 640-meter closed spline circuit, an elevated chase camera, and a DOM speed/gear/race HUD. All scenery is procedural; there are no downloaded models, textures, or fonts.

## Run locally

Use Node.js 20.19+ (or 22.12+) and npm:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates `dist/`; `npm run preview` serves that production build. pnpm also works, and a pnpm lockfile is included.

## GitHub Pages

The `.github/workflows/pages.yml` workflow tests, builds and deploys the game on every push to `main`. In repository **Settings → Pages**, select **GitHub Actions** as the publishing source. The workflow sets `VITE_BASE_PATH` to the repository's subdirectory so JavaScript and styles load correctly on project Pages URLs. Only the production `dist/` output is published; test pages and local preview screenshots are excluded.

To check the deployment build locally, run `VITE_BASE_PATH=/dustline-racing/ npm run build`, then `npm run preview` and open `/dustline-racing/` on its local server.

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Accelerate; brake when reversing |
| S / ↓ | Brake; keep holding to reverse |
| A D / ← → | Steer |
| R / Reset button | Return to the starting position |

Keyboard controls are required. Losing window focus clears held inputs.

## Main menu

The game opens in a main menu with selectable track and car cards: **Dirt Circuit** and **Rally Hatch** are currently the only choices. Press **Rozpocznij wyścig** to load a fresh attempt at the starting grid, then W / ↑ to begin timing. Track/car selection data and menu rendering live in `src/game/menu.js`. The car card renders the same `createCar()` model used in the race, including its materials and proportions; it redraws only when opened or resized.

The **Menu** button or **Esc** returns to the menu during a race; the results dialog also offers **Menu główne**. Returning ends the current attempt and resets the car, checkpoints and timer while retaining the personal best. Driving keys are disabled in the menu, and hidden race controls cannot receive focus.

## Race rules

Press W / ↑ to start the timer and leave the grid. Complete one lap through all six checkpoints in order, then cross the checkerboard start/finish line forwards. The next checkpoint has blue markers; cleared checkpoints turn green. A brief message shows each cumulative split.

The 640m centripetal Catmull–Rom circuit contains a sweeping north bend, a right/left chicane, and tighter southern turns. Moderate automated driving with the actual vehicle controller completes it in approximately **27–32 seconds**; human times vary with braking and drifting. Trees, tents, stalls and rally banners follow the whole course.

Gate detection sweeps the car's previous-to-current position through each finite gate, rejecting backwards and out-of-order passes and interpolating split/finish timestamps within the physics step. A 3m runoff beyond the road edge and a 1.25-second grace period allow brief drift excursions. Staying beyond that corridor automatically returns the car to the center of the last cleared checkpoint, facing forwards; before CP 01, it returns to the starting grid. Leaving the map bounds recovers immediately. Time keeps running and cleared splits remain intact. Velocity, visual effects and camera interpolation reset at the destination, while held driving keys remain active. Press R for a full restart. This is local arcade validation, not server-side anti-cheat.

The timer uses active simulation time, so it pauses when the tab is hidden and follows the same bounded catch-up as physics during long frame stalls. It freezes at the finish. The results dialog shows final time, per-sector and cumulative checkpoint splits, the final sector, and personal best. Try Again or R resets the car, camera, gates and timer without reloading.

Records use the versioned localStorage key `dustline:spline-circuit-v1:best`. Only faster valid finishes replace a record. If storage is denied or full, racing still works and the best remains available in memory for the session. Change the key when changing the circuit or race rules.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/main.js` | Renderer, fixed-step loop, render interpolation, resize, and reset |
| `src/game/config.js` | Physics, camera, track dimensions, and spawn tuning |
| `src/game/vehicle.js` | Render-independent planar vehicle simulation |
| `src/game/collisions.js` | Spatial lookup, oriented car/prop contacts, sliding and impact response |
| `src/game/input.js` | Keyboard state and input sampling |
| `src/game/camera.js` | Exponentially smoothed position and heading |
| `src/game/world.js` | Circuit mesh, race markers, procedural scenery, lighting |
| `src/game/track.js` | Shared spline, arc-length sampling, grid, surface projection, and directional gates |
| `src/game/race.js` | Race state, ordered checkpoints, split timing, course validation, personal best |
| `src/game/car-model.js` | Low-poly car and visual steering/body roll |
| `src/game/car-preview.js` | Static menu render of the shared gameplay car model |
| `src/game/wheel-particles.js` | Pooled dust puffs and low-poly sand emitted from the actual tires |
| `src/game/gears.js` | Shared HUD gear calculation and fixed-step shift detection |
| `src/game/exhaust-effects.js` | Attached backfire flame, brief warm light and bounded sparks |
| `src/game/hud.js` | mph/gears/revs, race timer, checkpoint cues, and finish dialog |
| `src/game/menu.js` | Track/car choices, selection cards, and start form |
| `src/style.css` | Fullscreen canvas and reference-inspired overlay |

## Vehicle and camera tuning

The simulation runs at 120 Hz, with meters, seconds, and radians throughout. Heading zero faces -Z; positive steering turns right. World-space velocity is independent of car heading, creating lateral slip during fast turns. Tire grip damps sideways velocity, steering is softened at speed, and aerodynamic/rolling drag limits acceleration. Grass adds resistance and reduces lateral grip. This is an arcade planar controller, not a suspension or tire-force simulator.

Tune `lateralGrip`, `highSpeedGrip`, and `steeringAngle` in `config.js` for cornering behavior. The camera defaults to 20 meters above and 14 meters behind, with a 42° perspective field of view and a small forward look offset. These values approximate the reference's elevated view; exact projection cannot be recovered from one screenshot. Position and shortest-path heading smoothing are independent of frame rate.

The HUD uses a translucent gray speed/gear strip, seven circular rev indicators, and blue active dots. Gears and revs are visual estimates from speed; they do not affect engine torque.

Crossing a displayed gear boundary produces a brief orange/cream backfire from the model's tailpipe: 0.15 seconds on upshifts and a stronger 0.23-second burst on downshifts, with a maximum of 24 reusable sparks. Detection runs at the physics rate and shares the HUD's gear calculation. A short cooldown prevents repeated flashes around a boundary; initial state, reverse transitions and menu/reset do not trigger bursts. The visual effect leaves acceleration, grip and camera behavior unchanged.

Dust and sand emit from all four tire contact positions, with stronger trails from the rear wheels. Speed and lateral slip increase emission; grass reduces it. Dust expands and fades, while sand follows short gravity-driven arcs and shrinks away. Two bounded pools use two draw calls, with no downloaded textures. The effect stops emitting when stationary or outside an active race, clears on restart/menu return, and leaves the car physics unchanged. Pool capacities and minimum emitting speed live in `CONFIG.particles`.

## Deliberate boundaries

Trees, stalls, tent posts/tables/benches, rally poles, and start/checkpoint supports have static collisions. The car uses an oriented rectangle matching its 2.44m width and 4.08m length, so the nose, rear, and sides can hit props while turning or drifting. Colliders inherit the visible object's world rotation and scale. Open tents can be entered between their supports; elevated roofs, overhead arches, foliage and painted road markings are decorative.

Collision resolution runs after each vehicle step and before checkpoint validation. Short movement/rotation intervals prevent passing through thin posts at speed; separating-axis contacts push the car outside obstacles, dissipate incoming velocity, and retain tangential motion with light friction. A spatial grid limits each check to nearby objects. Tune dimensions, restitution and friction in `CONFIG.collision`; the original acceleration/steering/drift parameters are unchanged. Props remain fixed in place, with no damage or destruction simulation.

Grass slows the car; extended course departures and leaving the map return it to the last cleared checkpoint without stopping the race. There are no opponents, audio, touch controls, or asset-loading pipeline. Add those as separate systems as the prototype grows.

## Validation

```sh
npm test
npm run build
```

The Node tests exercise the original vehicle controller plus immediate keyboard start, checkpoint order, directional swept gates, timing, automatic checkpoint recovery, record persistence/failure, restart, and complete simulated laps in the target duration. Recovery checks cover brief excursions, returning before CP 01, repeated returns after CP 06, timer/split preservation, and map bounds. Collision tests cover fast narrow-post impacts, side sliding, reversing, rotated/scaled props, turning near a wall, sustained contact, and unobstructed passage around the actual course. The calibration driver lives only in the test suite and is not shipped as an opponent or in-game autopilot.

With Vite running, open `/tests/race-ui.html` to inspect the real results UI with a synthetic completed race. Try Again tests its reset state; W completes another fixture lap. This test page reuses the real HTML and HUD module, does not write personal records, and is excluded from the production bundle.

Open `/tests/particles-ui.html` for an automatic visual check of tire dust and sand on the actual circuit. It uses the gameplay model, vehicle controller, collision layer and camera, and is excluded from the production bundle.

Open `/tests/exhaust-ui.html` for frozen views of upshift/downshift bursts. Both buttons drive the real vehicle across a HUD gear boundary before displaying the effect. Gear detection, reverse/reset behavior, tailpipe transforms, burst lifetime and pool limits also have Node tests.

Setup follows the [Three.js installation guide](https://threejs.org/manual/pages/installation.html).
