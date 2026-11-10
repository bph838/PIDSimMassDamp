# Heli Yaw PID Simulator

A browser simulator of an RC helicopter's yaw axis (tail rotor) under PID control. Change Kp, Ki and Kd and watch how the shape of the step response changes.

## Run it

- **Serve the folder:** `npx serve .` (or `npm start`), then open the URL it prints. There's no build step. A server is needed because browsers block ES modules on `file://`, so double-clicking `index.html` won't work. Any static server works, for example `python -m http.server`.
- Chart.js loads from the jsDelivr CDN, so you need to be online.
- Headless checks: `node test.js` (or `npm test`). This runs every preset, prints a metrics table, and checks each preset's described behaviour plus the physics sanity checks.

## Files

```
index.html, style.css   layout and light/dark theme (follows the OS)
test.js                 Node test + metrics script (imports sim/ only)

sim/                    simulation: no DOM, runs in the browser and in Node
  index.js              public API: everything outside sim/ imports from here
  defaults.js           all model and scenario parameters, with units
  pid.js                PID controller: D filter, derivative on measurement or error, anti-windup, clamp
  heli.js               plant: tail servo (lag + slew limit), yaw dynamics, hover equilibrium
  simulate.js           scenario runner: pre-roll, step, fixed-step loop, recording
  metrics.js            rise / overshoot / settling / steady-state error
  presets.js            the preset gains and their descriptions
  noise.js              seeded Gaussian noise for the gyro

ui/                     browser only
  main.js               entry point: wires the modules together, run() and showAt()
  state.js              UI state and its mapping to simulate() parameters
  controls.js           sliders, number boxes, checkboxes, preset buttons
  charts.js             the three Chart.js graphs, playhead and hover tooltips
  readouts.js           metric tiles
  heliView.js           top-down helicopter canvas
  playback.js           Play/Pause, 1× / 0.25×
  pins.js               "Pin this run" (up to 4 ghost traces)
  theme.js, util.js     colours from CSS variables; small helpers
```

To add a new control: add the field to `ui/state.js` (and `simParams()`), add a row to `SLIDERS` in `ui/controls.js` (or a checkbox in `index.html` plus `CHECKBOXES`), and use it in `sim/`. Physics changes stay in `sim/` and are covered by `node test.js`.

## Model

- Yaw: `dr/dt = A·θ − D_main − b·r`, `dψ/dt = r`, with A = 64, b = 2 /s and D_main = 320 °/s² (main-rotor torque, so the tail needs +5° just to hold still).
- Tail servo: first-order lag (τ = 20 ms) plus a 1000 °/s slew limit, toward a command clamped to ±θmax.
- Physics step 0.5 ms (semi-implicit Euler). The controller runs at the loop rate (1 kHz by default).
- PID: derivative on measurement with a first-order low-pass filter (or derivative on error, as an option). Conditional-integration anti-windup (can be turned off). Output clamped to ±θmax.
- Each run starts at the hover equilibrium for the current gains, holds setpoint 0° for a 2 s pre-roll, then steps at t = 0. The last 0.5 s of the pre-roll is plotted.

## What to look for in each preset

| Preset | Gains | What you should see |
|---|---|---|
| P only | Kp 0.5 | Sits 10° off target **before** the step. Overshoots about 45%, rings, and settles about 10° short. The steady-state error is 5° / Kp. |
| PI | Kp 0.5, Ki 0.3 | Same as P only, but the I term slowly pulls the mean heading onto 45°. It rings for seconds. Set duration to 10 s to watch it converge. |
| PD | Kp 1, Kd 0.1 | Well damped (about 5% overshoot), but still settles 5° short because there's no I. |
| Good PID | Kp 2, Ki 3, Kd 0.2 | About 12% overshoot, settled on target in under 1 s. The I term quietly carries the 5° trim. |
| Too much P | Kp 5, Ki 3, Kd 0.15 | Fast rise, but the tail slams between ±θmax (about 19% of the time saturated) and the heading rings. |
| Too much I | Kp 1.5, Ki 15, Kd 0.15 | Big overshoot (about 50%) and a slow wallowing oscillation that never dies out. |
| Too much D | Kp 1.5, Ki 3, Kd 0.8 (+0.02° noise) | Over-damped crawl (rise time 0.5 s) with a slow I-driven overshoot, and the tail command buzzes with amplified gyro noise. |

### Other experiments

- **Derivative on error**: tick it and look at the P/I/D graph at t = 0. The D term spikes to thousands of degrees (the derivative kick) and slams the tail.
- **Anti-windup off**: set the step to 180°. Overshoot jumps from about 6% to about 68%, because the I term charges up while the tail is saturated.
- **Collective punch**: watch the heading get knocked back and see how quickly each tune recovers. P-only and PD settle at a new, larger offset.
- **Gyro noise**: raise it and compare the tail-pitch trace for Kd 0.2 and Kd 0.8. Then lower the D-filter cutoff and watch the chatter drop.
- **θmax ≈ 6°**: with only 1° of authority above trim, a 180° step becomes a straight ramp at about 32 °/s.
- **Pin this run**: freeze up to 4 heading traces to compare tunes.

## Changes from the original preset list

The original preset values were checked against this model with `node test.js`. Three of them were changed:

- **P only, Kp 1 → 0.5.** With Kp 1, the heading is still swinging ±10° at 4 s. Without D, the decay rate is set only by the yaw damping b, and servo lag makes that worse. Kp 0.5 settles further within the window and makes the offset (10°) more obvious.
- **PI, Kp 1 / Ki 2 → Kp 0.5 / Ki 0.3.** Ki 2 with Kp 1 is past the stability limit. Even without servo lag the limit is Ki < 2·Kp, and the 20 ms lag pulls it down to about 0.7·Kp. It limit-cycles forever, so the error never goes away.
- **Too much D also turns on 0.02° gyro noise.** With no noise, Kd 0.8 is only sluggish. The jitter needs noise for D to amplify.
