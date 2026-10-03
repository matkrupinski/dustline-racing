# Dustline

A small, single-player Three.js time attack: two selectable cars, two closed spline circuits (640m dirt and 560m snow), a 3.6km night stage, an elevated chase camera, and a DOM speed/gear/race HUD. All scenery is procedural; there are no downloaded models, textures, or fonts.

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

The game opens in a main menu with selectable track and car cards: **Dirt Circuit** (640m gravel), **Winter Pass** (560m snow), or **Phonk Docks** (3600m night asphalt), with **Rally Hatch (4×4)** and **Stratos Sprint (RWD)** as selectable cars. The coupe has a short, wide wedge body inspired by the [Lancia Stratos](https://www.stellantisheritage.com/en-uk/heritage/stories/lancia-stratos); it is a procedural interpretation, not a licensed or measured replica. Each course thumbnail follows its actual spline; the winter card explains its lower grip. Press **Rozpocznij wyścig** to load a fresh attempt at the starting grid, then W / ↑ to begin timing. Car definitions live in `src/game/cars.js`; track choices and menu rendering live in `src/game/menu.js`. The car card renders the same `createCar()` model used in the race, including its materials and proportions; it redraws only when opened or resized.

The **Menu** button or **Esc** returns to the menu during a race; the results dialog also offers **Menu główne**. Returning ends the current attempt and resets the car, checkpoints and timer while retaining the personal best. Driving keys are disabled in the menu, and hidden race controls cannot receive focus.

## Winter Pass

Winter Pass has its own 560m closed spline, sweeping forest bends, a right/left section, six sequential checkpoints and start/finish arch. Snow-covered evergreens, soft roadside banks, distant angular peaks, winter lighting and white powder/chunks from the tires distinguish it from Dirt Circuit. Tents, banners and solid roadside props use the existing collision system. Careful calibration driving with the actual snow controller and collisions completes a lap in approximately **32–34 seconds**; driving too fast through a bend can miss a gate.

The snow profile in `SURFACE_PHYSICS.snow` reduces acceleration from 10.5 to 7.2 m/s² and braking from 22 to 10 m/s². Lateral grip drops from 9 to 4, high-speed grip from 2.4 to 1.1, and sliding begins at a lower speed. Steering/yaw respond more slowly, and maximum forward speed is 31 m/s. Roadside deep snow adds more resistance. Brake earlier and countersteer gently. This is an arcade packed-snow approximation, without a tire/suspension or temperature simulation. Dirt retains its established steering, grip, acceleration and drag tuning; both surfaces now apply axle traction limits under throttle.

Course selection switches geometry, colliders, physics, spawn, gates, HUD name and tire particles together. Old course GPU resources are disposed; the shared car, chase camera, audio and exhaust effects stay in place. Restart/recovery uses the selected course. Best times are independent for each car/course combination: the original hatch dirt key is preserved, while hatch winter uses `dustline:winter-pass-v1:best`. Stratos records insert `:stratos-sprint` before `:best`. Race objects retain session bests if localStorage is unavailable.

## Phonk Docks / soundtrack

The third course is a **3600m point-to-point night stage** inspired by [KORDHELL — MURDER IN MY MIND](https://www.youtube.com/watch?v=w-sQRS-Lc9k). The recording is **2:25**, with a published tempo of **160 BPM** ([tempo/duration source](https://songdata.io/track/6qyS9qBy0mEk3qYaH8mPss/Murder-In-My-Mind-by-Kordhell)). Industrial blocks, shipping containers, cyan/magenta roadside lights and dark asphalt give it a phonk/drift setting. Six gates, a separate finish arch and per-car personal bests use the existing race system. Both real vehicle controllers complete the stage in approximately **145 seconds** with collisions enabled; human speed, drifts and recovery change the final time.

The revised route folds through five hairpins and roughly 30 substantial bends, alternating left/right chicanes with wider sweeps. Its compact layout replaces the former straight corridor. A new v2 personal-best key keeps times on the old layout separate. Roadside lights, illuminated building windows and neon rooftop bars pulse at 160 BPM using the actual playback position. Rooftop bars rise and fall with authored beat accents, while signs change emissive brightness. Each building picks a different pseudo-random window for its 60 ms flash on each beat (seeded by building and playback beat so seeking and restarting reproduce the selection); four pooled spotlights originate at actual window centers and project outward onto the roadside, with faint visible light shafts. Roadside shipping containers have corrugated sides and roofs, steel corner rails, double doors and locking rods; their original collision footprint is preserved. Streetlights use swept movable-prop collisions: hits absorb part of the car momentum and tip the complete lamp in the travel direction, with gravity, ground support and damped sliding. Fallen lamps stay passable until a full restart restores them. All effects freeze when the song pauses and return to their initial state on reset. Repeated background details use instanced meshes, and decorative animation never moves a collider. Sections in `music-theme.js` are an authored driving arrangement, not detected audio drops or an automatic music analysis. The asphalt profile has stronger lateral grip, braking and axle traction than dirt; drifting/wheelspin emits gray tire smoke, while leaving the asphalt emits dirt. The original dirt/snow vehicle tuning is preserved. Open splines clamp at their endpoints and use bounds derived from the whole route, so passing the old circuit's 240m boundary does not cause recovery.

Phonk Docks automatically loads the supplied MP3 from `public/audio/kordhell-murder-in-my-mind.mp3` using native HTML audio. Its measured duration is 145.06 seconds. Playback starts with W / ↑ or **Odtwórz** and offers independent music volume/mute. Reset seeks to zero; recovery retains elapsed time; menu return, focus loss, hidden tabs and finishing pause music. Large playback drift is corrected at most every two seconds. A completed song does not loop automatically. Vite's base URL is respected, including subdirectory previews.

The MP3 was supplied from the user's Downloads folder; no YouTube extraction or external upload occurs. It is ignored by Git and included in local Vite builds. Choose **Wybierz plik utworu** to temporarily override it with another local file for the current session. No manual file selection is needed for the default soundtrack. The title link opens the original YouTube page. Courses without an audio asset can still use the visible [official YouTube IFrame player](https://developers.google.com/youtube/iframe_api_reference), with native controls and a minimum 200×200 viewport; the original upload currently refuses embedding (error 150), so the supplied MP3 avoids that dependency.

## Race rules

Press W / ↑ to start the timer and leave the grid. Pass all six checkpoints in order, then cross the finish line forwards. Dirt/Winter are one-lap circuits; Phonk Docks is a point-to-point stage with separate start and finish arches. The next checkpoint has blue markers; cleared checkpoints turn green. A brief message shows each cumulative split.

The 640m centripetal Catmull–Rom circuit contains a sweeping north bend, a right/left chicane, and tighter southern turns. Moderate automated driving with the actual vehicle controller completes it in approximately **27–32 seconds**; human times vary with braking and drifting. Trees, tents, stalls and rally banners follow the whole course.

Gate detection sweeps the car's previous-to-current position through each finite gate, rejecting backwards and out-of-order passes and interpolating split/finish timestamps within the physics step. A 3m runoff beyond the road edge and a 1.25-second grace period allow brief drift excursions. Staying beyond that corridor automatically returns the car to the center of the last cleared checkpoint, facing forwards; before CP 01, it returns to the starting grid. Leaving the map bounds recovers immediately. Time keeps running and cleared splits remain intact. Velocity, visual effects and camera interpolation reset at the destination, while held driving keys remain active. Press R for a full restart. This is local arcade validation, not server-side anti-cheat.

The timer uses active simulation time, so it pauses when the tab is hidden and follows the same bounded catch-up as physics during long frame stalls. It freezes at the finish. The results dialog shows final time, per-sector and cumulative checkpoint splits, the final sector, and personal best. Try Again or R resets the car, camera, gates and timer without reloading.

Hatch dirt records use the versioned localStorage key `dustline:spline-circuit-v1:best`; hatch winter records use `dustline:winter-pass-v1:best`. Each Stratos record uses its own car-specific key. Only faster valid finishes replace a record. If storage is denied or full, racing still works and the best remains available in memory for the session. Change the key when changing the circuit or race rules.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/main.js` | Renderer, fixed-step loop, render interpolation, resize, and reset |
| `src/game/config.js` | Dirt/snow physics profiles, camera, track dimensions, and spawn tuning |
| `src/game/cars.js` | Car definitions, axle torque distribution, dimensions and record categories |
| `src/game/vehicle.js` | Render-independent planar simulation with axle traction and power oversteer |
| `src/game/collisions.js` | Spatial lookup, oriented car/prop contacts, sliding and impact response |
| `src/game/checkpoint-pylons.js` | Passable checkpoint poles with swept impact detection, tipping, sliding, ground bounce and reset |
| `src/game/input.js` | Keyboard state and input sampling |
| `src/game/camera.js` | Exponentially smoothed position and heading |
| `src/game/world.js` | Circuit mesh, race markers, procedural scenery, lighting |
| `src/game/track.js` | Per-course splines, arc-length sampling, grids, surface projection, and directional gates |
| `src/game/race.js` | Race state, ordered checkpoints, split timing, course validation, personal best |
| `src/game/car-model.js` | Shared hatch/coupe models, wheel/exhaust anchors, resource disposal and visual roll |
| `src/game/car-preview.js` | Static menu render of the shared gameplay car model |
| `src/game/wheel-particles.js` | Pooled dust puffs and low-poly sand emitted from the actual tires |
| `src/game/gears.js` | Shared HUD gear calculation and fixed-step shift detection |
| `src/game/exhaust-effects.js` | Attached backfire flame, brief warm light and bounded sparks |
| `src/game/vehicle-audio.js` | Procedural engine RPM/load sound, shift clicks, exhaust cracks, mute and voice cleanup |
| `src/game/music-theme.js` | Soundtrack metadata, authored road sections and beat phase |
| `src/game/race-music.js` | Visible YouTube/native-file playback, race sync, volume/mute and resource cleanup |
| `src/game/hud.js` | km/h/gears/revs, race timer, checkpoint cues, and finish dialog |
| `src/game/menu.js` | Track/car choices, selection cards, and start form |
| `src/style.css` | Fullscreen canvas and reference-inspired overlay |

## Vehicle and camera tuning

The simulation runs at 120 Hz, with meters, seconds, and radians throughout. Heading zero faces -Z; positive steering turns right. World-space velocity is independent of car heading, creating lateral slip during fast turns. Tire grip damps sideways velocity, steering is softened at speed, and aerodynamic/rolling drag limits acceleration. Grass adds resistance and reduces lateral grip. This is an arcade planar controller, not a suspension or tire-force simulator.

Car setup combines a surface profile with a car definition. The hatch splits engine demand equally between both axles. Stratos Sprint sends all torque to the rear, with a shorter 2.2m wheelbase and 60% rear weight share. Each axle has a finite acceleration reserve, reduced by cornering load. Driving and lateral support compete for that reserve: the rear-driven coupe launches less effectively, loses rear grip under throttle, and rotates further into a slide. Lifting the throttle restores lateral grip; countersteer opposes the bounded extra yaw. Snow lowers the traction reserve from 14 to 10 m/s² in addition to its softer steering and lower lateral grip. These are tunable arcade values, not factory data or a full tire-force model.

The coupe can be selected on all three maps. Changing cars replaces and disposes only the gameplay model, rebinds wheel particles and the exhaust anchor, selects the correct collision footprint and record category, and starts at the selected grid. The menu uses the same factory and car definition as gameplay. Restart and checkpoint recovery preserve the selected drivetrain. Calibrated driving with real collisions completes both cars on both maps within roughly 29–35 seconds; human times vary.

Tune `lateralGrip`, `highSpeedGrip`, and `steeringAngle` in `config.js` for cornering behavior. The elevated chase camera now sits 27 meters above and 18 meters behind, with a 52° field of view and a focus point 13 meters ahead. The car sits in the lower portion of the frame; at least 65 meters of straight road ahead remain visible, making upcoming bends easier to read on all maps. Position and shortest-path heading smoothing are independent of frame rate.

The HUD uses a translucent gray speed/gear strip in km/h, seven circular rev indicators, and blue active dots. Speed converts meters per second to km/h with a factor of 3.6. Gears and revs retain their original speed thresholds and do not affect engine torque.

Crossing a displayed gear boundary produces a brief orange/cream backfire from the model's tailpipe: 0.15 seconds on upshifts and a stronger 0.23-second burst on downshifts, with a maximum of 24 reusable sparks. Detection runs at the physics rate and shares the HUD's gear calculation. A short cooldown prevents repeated flashes around a boundary; initial state, reverse transitions and menu/reset do not trigger bursts. The visual effect leaves acceleration, grip and camera behavior unchanged.

Dust and sand emit from all four tire contact positions, with stronger trails from the rear wheels. Speed, lateral slip and wheelspin on driven wheels increase emission; grass reduces it. Dust expands and fades, while sand follows short gravity-driven arcs and shrinks away. Two bounded pools use two draw calls, with no downloaded textures. The effect stops emitting when stationary or outside an active race, clears on restart/menu return, and leaves the car physics unchanged. Pool capacities and minimum emitting speed live in `CONFIG.particles`.

## Vehicle sound

VehicleAudio uses Web Audio synthesis, with no downloaded samples: soft low combustion harmonics and a stronger 53–110 Hz sine rumble follow RPM, while a low-pass exhaust filter, a 170 Hz bass shelf and much quieter mechanical noise give the car a deep sound without sharp buzzing. Throttle controls body and brightness; a 28 Hz high-pass removes inaudible sub-bass. The sound uses the displayed gearbox; upshifts drop the pitch and briefly cut the engine, while downshifts blip it. One shared shift event triggers the mechanical click, exhaust crack/thump, and visual flame in the same render frame. Downshift bursts are stronger and longer. Audio does not change vehicle torque, drift, timing, camera, or gear thresholds.

Start/accelerate/unmute unlocks audio through a user gesture. The car idles at the starting grid, and sound fades out in the menu, at the finish, on focus loss, or when the tab is hidden. Restart and checkpoint recovery clear pending bursts and restore idle RPM. The **Dźwięk** button mutes all vehicle sounds and keeps that setting across restarts/menu returns for the session. Browsers without audio support still run the game. Continuous nodes and a shared noise buffer are reused, transient voices are bounded to nine, and ended sources disconnect.

## Deliberate boundaries

Trees, stalls, tent posts/tables/benches, roadside rally poles and start/finish supports have static collisions. Phonk Docks streetlights have visible 0.72m square solid bases and 0.3m wide solid stems, registered with their actual world transforms. Swept collision checks stop both cars even on fast forward/reverse approaches to rotated lamps; the elevated light heads remain decorative. Checkpoint pylons use separate movable prop physics: a swept car contact gives each pole/panel group a one-way impulse, tipping it in the direction of travel, with a small hop, damped ground bounce and sliding. They never push, brake or block the car, including when fallen. Snow lets them slide further. The fixed checkpoint gate, stripe and overhead label remain in place, so moving a pylon does not change checkpoint order or crossing validation. Physics runs at the same fixed 120 Hz as the vehicle; a full restart/menu return restores all pylons upright, while checkpoint recovery preserves fallen ones for the current attempt. Map disposal clears their state and releases their meshes with the rest of the world. Each car uses its own oriented collision rectangle (2.44 × 4.08m for the hatch; 2.36 × 3.96m for the coupe), so the nose, rear, and sides can hit props while turning or drifting. Colliders inherit the visible object's world rotation and scale. Open tents can be entered between their supports; elevated roofs, overhead arches, foliage and painted road markings are decorative.

Collision resolution runs after each vehicle step and before checkpoint validation. Short movement/rotation intervals prevent passing through thin posts at speed; separating-axis contacts push the car outside obstacles, dissipate incoming velocity, and retain tangential motion with light friction. A spatial grid limits each check to nearby objects. Tune per-car dimensions in `cars.js` and contact response in `CONFIG.collision`. Props remain fixed in place, with no damage or destruction simulation.

Grass slows the car; extended course departures and leaving the map return it to the last cleared checkpoint without stopping the race. There are no opponents, touch controls, or asset-loading pipeline. Add those as separate systems as the prototype grows.

## Validation

Phonk tests cover real streetlight impacts, unobstructed passage below elevated lamp heads, deterministic background beat animation, paused playback clocks, open-spline geometry, separate directional start/finish gates, far-route bounds/recovery, six sequential checkpoints, both collision-enabled 2:25 runs, asphalt particles and world disposal. Music tests exercise automatic asset selection, local-file override, stable asset URL handling, sync throttling, autoplay refusal, manual pause, end-of-song behavior, stale loading callbacks, seeking, mute and object-URL cleanup. `/tests/music-ui.html` verifies the supplied MP3 or a user-selected file, with playback time/duration/mute metrics; `?source=youtube` checks the original stream and `?source=audio` checks the alternate official audio upload. It is excluded from the production build.

Checkpoint-pylon tests cover high-speed swept contact, forward/reverse/glancing hits, misses, non-blocking passage for both cars, ground settling, snow sliding, restart, real-world static collider exclusion and unchanged checkpoint validation on all three maps.

Drivetrain tests compare AWD/RWD axle forces, launch traction, isolated power oversteer, throttle lift and countersteer, bounded reverse and deterministic fixed steps. They also check shared model contacts, resource cleanup, per-car collision dimensions, effect rebinding, six independent record categories and complete collision-enabled laps on the original circuits.

Winter tests compare acceleration, stopping distance and retained lateral slip against dirt; validate winter gate order, recovery and separate records; check clear road geometry and map-resource cleanup; verify white snow particles; and complete real simulated laps with collisions enabled.

```sh
npm test
npm run build
```

The Node tests exercise the original vehicle controller plus immediate keyboard start, checkpoint order, directional swept gates, timing, automatic checkpoint recovery, record persistence/failure, restart, and complete simulated laps in the target duration. Recovery checks cover brief excursions, returning before CP 01, repeated returns after CP 06, timer/split preservation, and map bounds. Collision tests cover fast narrow-post impacts, side sliding, reversing, rotated/scaled props, turning near a wall, sustained contact, and unobstructed passage around the actual course. The calibration driver lives only in the test suite and is not shipped as an opponent or in-game autopilot.

With Vite running, open `/tests/race-ui.html` to inspect the real results UI with a synthetic completed race. Try Again tests its reset state; W completes another fixture lap. This test page reuses the real HTML and HUD module, does not write personal records, and is excluded from the production bundle.

Open `/tests/particles-ui.html` for an automatic visual check of tire dust and sand on the actual circuit. It uses the gameplay model, vehicle controller, collision layer and camera, and is excluded from the production bundle. Add `?car=stratos-sprint&course=winter-pass` to inspect the RWD coupe on snow.

Open `/tests/exhaust-ui.html` for frozen views of upshift/downshift bursts. Both buttons drive the real vehicle across a HUD gear boundary before displaying the effect. Gear detection, reverse/reset behavior, tailpipe transforms, burst lifetime and pool limits also have Node tests.

Open `/tests/audio-ui.html` and run its test to render ten real OfflineAudioContext scenarios: menu silence, idle, loaded engine, upshift, downshift, isolated upshift/downshift bursts, mute, reset, and voice-limit stress. It checks nonzero output, bass dominance over sharp treble, isolated burst strength (without engine phase cancellation), cleanup silence, bounded voices, finite samples and clipping. A separate four-second live test unlocks AudioContext through a click and drives the actual vehicle/gear tracker through acceleration, downshifts and mute, measuring the output and checking that bursts clear. This fixture is excluded from the production build. Node tests also cover RPM/load/reverse, gear transitions, unavailable audio and muted/suspended event suppression.

Open `/tests/pylons-ui.html` and press **Uderz w pylon** to replay a hit on the real CP 01 pylon. The car passes through and the fixed checkpoint is awarded while the marker tips and settles. Add `?course=winter-pass&car=rally-hatch` to inspect a different surface/car. This fixture is excluded from the production bundle and does not save records.

Setup follows the [Three.js installation guide](https://threejs.org/manual/pages/installation.html).

Open `/tests/night-ui.html` to test a high-speed impact on a real streetlight and the background pulse against the supplied MP3. Play/pause/reset controls display playback time and window brightness so synchronization can be checked directly. The fixture does not save records and is excluded from the production bundle.
