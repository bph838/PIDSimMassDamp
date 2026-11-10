# Heli Yaw PID Simulator

A browser simulator of an RC helicopter's tail (yaw axis), controlled by a port of the yaw PID loop from the [Rotorflight](https://github.com/rotorflight/rotorflight-firmware) flight-controller firmware. Change the gains in Rotorflight's own units and watch how the tail responds to stick flicks, pirouette stops and collective punches.

## Run it

- **Serve the folder:** `npx serve .` (or `npm start`), then open the URL it prints. There's no build step. A server is needed because browsers block ES modules on `file://`, so double-clicking `index.html` won't work. Any static server works, for example `python -m http.server`.
- Chart.js loads from the jsDelivr CDN, so you need to be online.
- Headless checks: `node test.js` (or `npm test`). This checks the ported code against values computed from the C source, runs every preset, prints a metrics table, and checks each preset's described behaviour plus some physics sanity checks.

## Files

```
index.html, style.css   layout and light/dark theme (follows the OS)
test.js                 Node test + metrics script (imports sim/ only)

sim/                    simulation: no DOM, runs in the browser and in Node
  index.js              public API: everything outside sim/ imports from here
  defaults.js           all model and scenario parameters, with units
  heli.js               plant: tail servo (lag + slew limit), yaw dynamics
  scenario.js           pilot inputs (stick flick, piro) and collective -> torque model
  simulate.js           runner: pre-roll in hover, fixed-step loop, recording
  metrics.js            rise / overshoot / settling / steady-state error, plus stop metrics
  presets.js            preset profiles and their descriptions
  noise.js              seeded Gaussian noise for the gyro
  util.js               small numeric helpers
  rotorflight/          port of Rotorflight firmware code (GPL-3.0-or-later)
    yawPid.js           pidApplyYawMode3, yaw precomp, mixer saturation, default profile
    filters.js          pt1, first-order LPF, band-limited differentiator, transition()

ui/                     browser only
  main.js               entry point: wires the modules together, run() and showAt()
  state.js              UI state and its mapping to simulate() parameters
  controls.js           sliders, checkboxes, pilot input, preset buttons
  charts.js             the four Chart.js graphs, playhead and hover tooltips
  readouts.js           metric tiles
  heliView.js           top-down helicopter canvas
  playback.js           Play/Pause, 1× / 0.25×
  pins.js               "Pin this run" (up to 4 ghost traces)
  theme.js, util.js     colours from CSS variables; small helpers
```

To add a new control: add the field to `ui/state.js` (and `simParams()`), add a row to `SLIDERS` in `ui/controls.js` (or a checkbox in `index.html` plus `CHECKBOXES`), and use it in `sim/`. A slider key like `rf.P` writes into the Rotorflight profile, and a `show` function on a slider controls when it's visible. Physics changes stay in `sim/` and are covered by `node test.js`.

## Model

- Yaw: `dr/dt = A·θ − torque − b·r`, `dψ/dt = r`, with A = 64 and b = 2 /s.
- Main-rotor torque is 320 °/s² at the 6° hover collective, so the tail needs +5° just to hold still. It grows with collective² (induced drag). The collective punch raises collective from 6° to about 9.3°, adding 192 °/s².
- Tail servo: first-order lag (τ = 20 ms) plus a 1000 °/s slew limit, toward a command clamped to ±θmax.
- Physics step 0.5 ms (semi-implicit Euler). The controller runs at the loop rate (1 kHz by default).
- Each run starts at the hover equilibrium for the current gains and holds still for a 2 s pre-roll, then the pilot input starts at t = 0. The last 0.5 s of the pre-roll is plotted.
- Pilot inputs:
  - **Stick flick:** the yaw stick is held at a rate until the commanded heading has moved the yaw angle, then centred.
  - **Piro & stop:** the stick is held at the piro rate, then centred.
- Both inputs report stop metrics measured after the stick is centred: drift-on, bounce-back and stop time. For a piro, the heading-tracking tiles (overshoot, steady-state error and so on) are hidden, because a rate controller doesn't try to reach the integrated stick angle.

## The Rotorflight controller

`sim/rotorflight/` is a JavaScript port of Rotorflight's yaw loop, from firmware commit `df6bda6` (Nov 2026):

- **What's ported:** `pidApplyYawMode3` (P with CW/CCW stop gains, D on measured rate, I with I-term relax, error limit and decay, F and B feedforward), the gyro bandwidth filter, the collective/cyclic-to-yaw precomp, the mixer's input limit and 5-cycle saturation flag (which is its anti-windup), and the default yaw profile.
- **What's not ported:** the stick rates pipeline (the setpoint is given in °/s directly), inertia precomp (headspeed is constant here), ground error decay, upstream gyro filters and notches, and mixer rules.
- **Units.** Gains are in Rotorflight's own units. Its output is a mixer input where 1.0 = 24° of tail pitch, the configurator's tail override scale.
- **What the gains do.** Rotorflight controls yaw **rate**, not heading. **P** damps rate error (stock P 80 = 0.128° of tail pitch per °/s). **I** integrates rate error into heading hold (stock I 120 = 1.44° of pitch per ° of heading error). **D** acts on yaw acceleration.
- **Torque-model calibration.** The torque model's collective coefficient is set so that Rotorflight's default collective FF (60) matches this model.
- **Assumption.** The CW stop gain is applied when the rate error is positive (tail pushing the nose right). If Rotorflight's internal yaw sign is the opposite, the CW/CCW labels swap.

## Presets

All presets use a 360°/s piro for 1.5 s, or a 45° flick at 180°/s. "Stop" values are measured after the stick is centred.

| Preset | Changes from stock | What you should see |
|---|---|---|
| Stock | P 80, I 120, D 10, stop gains 120/80, collective FF 60 | Piro stop takes about 0.75 s, carries on about 40° and bounces back about 17°. |
| Community | P 120, I 180, D 20, stop gains 180/165 | Crisp stop: about 0.34 s with only about 3° of bounce-back. |
| Soft stops | stop gains 50/50 | Lets go late: bounces back about 28° and wobbles. Takes about 1.45 s to stop. |
| Rate mode (I = 0) | I 0 | No heading hold. Main-rotor torque makes it drift steadily (about 15 °/s). |
| Too much I | I 700 | A tail wag (3–4 Hz) that never dies out. |
| Precomp off | collective FF 0, punch on | The collective punch kicks the heading about 2.4°. Collective FF 60 cuts that to about 0.6°. |
| Noisy D | D 60, +5 °/s gyro noise | D acts on acceleration, so noise turns into tail chatter (about 2× stock D). |

### Things to try

- **Stop gains:** pin Stock, then try Community and Soft stops on the same piro to compare the stops side by side.
- **I-term relax** (under *Advanced*): a flick holds a few degrees short of the stick angle, because relax stops I from accumulating heading error while the stick is moving. Untick it and the flick finishes with less overshoot but further from the stick angle.
- **Collective FF:** turn on the collective punch and sweep collective FF from 0 to 100. The kick disappears around 60, and above that it overcompensates.
- **θmax ≈ 6°:** with only 1° of authority above trim, a piro is capped at about 32 °/s, the physical limit.
- **There's no "Too much P" preset.** Very high P doesn't oscillate on this model, which lacks the fast tail dynamics that cause it on a real helicopter.

## Licence

This project is licensed under the **GNU General Public License v3.0 or later** (see `LICENSE`), because `sim/rotorflight/` is a port of [Rotorflight](https://github.com/rotorflight/rotorflight-firmware), which is GPL-3.0-or-later. The ported files carry Rotorflight's licence notice and name the source files they come from.
