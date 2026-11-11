# Heli Yaw PID Simulator

A browser simulator of an RC helicopter's tail (yaw axis), controlled by a port of the yaw PID loop from the [Rotorflight](https://github.com/rotorflight/rotorflight-firmware) flight-controller firmware. Change the gains in Rotorflight's own units and watch how the tail responds to stick flicks, pirouette stops and collective punches.

## Run it

- **Serve the folder:** `npm start`, then open http://localhost:8642. There's no build step. A server is needed because browsers block ES modules on `file://`, so double-clicking `index.html` won't work. Any static server works, for example `python -m http.server`.
- **Why port 8642:** other dev tools often run on `localhost:3000` and can leave a service worker there. A leftover service worker hijacks a normal refresh (F5) and shows a white page, while Ctrl+F5 works. A dedicated port avoids that. If it ever happens, open DevTools → Application → Storage → **Clear site data** for that address.
- Chart.js loads from the jsDelivr CDN, so you need to be online.
- Headless checks: `node test.js` (or `npm test`). This checks the ported code against values computed from the C source, runs every preset, prints a metrics table, and checks each preset's described behaviour plus some physics sanity checks.

## Files

```
index.html, style.css   layout and light/dark theme (follows the OS)
test.js                 Node test + metrics script (imports sim/ only)

sim/                    simulation: no DOM, runs in the browser and in Node
  index.js              public API: everything outside sim/ imports from here
  defaults.js           all model and scenario parameters, with units
  heli.js               plant: tail servo (lag + slew limit), thrust lag, yaw dynamics
  scenario.js           pilot inputs (stick flick, piro) and collective -> torque model
  simulate.js           runner: gyro LPF, servo frame, pre-roll in hover, fixed-step loop, recording
  metrics.js            rise / overshoot / settling / steady-state error, plus stop metrics
  presets.js            preset profiles and their descriptions
  noise.js              seeded Gaussian noise for the gyro
  util.js               small numeric helpers
  rotorflight/          port of Rotorflight firmware code (GPL-3.0-or-later)
    yawPid.js           pidApplyYawMode3, yaw precomp, mixer saturation, default profile
    filters.js          pt1, first-order LPF, band-limited differentiator, transition()
    rates.js            applyRatesCurve: stick deflection -> yaw rate, all six rate types
    cli.js              reads the yaw PID profile and yaw rates from a CLI diff/dump

ui/                     browser only
  main.js               entry point: wires the modules together, run() and showAt()
  state.js              UI state and its mapping to simulate() parameters
  controls.js           sliders, checkboxes, pilot input, preset buttons
  charts.js             the four Chart.js graphs, playhead and hover tooltips
  readouts.js           metric tiles
  heliView.js           top-down helicopter canvas
  playback.js           Play/Pause, 1× / 0.25×
  pins.js               "Pin this run" (up to 4 ghost traces)
  rfConfig.js           "Your Rotorflight config" panel: load, pick profiles, save in localStorage
  theme.js, util.js     colours from CSS variables; small helpers
```

To add a new control: add the field to `ui/state.js` (and `simParams()`), add a row to `SLIDERS` in `ui/controls.js` (or a checkbox in `index.html` plus `CHECKBOXES`), and use it in `sim/`. A slider key like `rf.P` writes into the Rotorflight profile, and a `show` function on a slider controls when it's visible. Physics changes stay in `sim/` and are covered by `node test.js`.

## Load your own Rotorflight config

In the Rotorflight configurator's CLI tab, run `diff all` (or `dump all`) and save or copy the output. Then use **Load file…** or **Paste text** in the *Your Rotorflight config* panel.

- **Yaw PID profile:** the active PID profile's yaw values replace the sliders: `yaw_p/i/d/f/b_gain`, `yaw_cw/ccw_stop_gain`, `yaw_gyro_cutoff`, `yaw_d_cutoff`, `yaw_b_cutoff`, yaw entries of `error_limit`, `iterm_relax_level` and `iterm_relax_cutoff`, `iterm_relax_type`, `error_decay_time_yaw`, `error_decay_limit_yaw`, `yaw_precomp_cutoff`, `yaw_collective_ff_gain`, `yaw_cyclic_ff_gain` and `yaw_master_gain`. A diff only lists changed values, so anything missing is the firmware default.
- **Yaw rates:** `rates_type`, `yaw_rc_rate`, `yaw_expo` and `yaw_srate` from the active rate profile go through a port of `applyRatesCurve`. The flick and piro stick rates are set to your full-stick yaw rate, and each stick-rate slider shows how much stick that rate takes on your curve.
- **Profiles:** with several PID or rate profiles you can pick which one to use. The active ones are picked by default.
- **Not simulated:** `yaw_response`, `yaw_accel_limit`, setpoint boost, the yaw dynamic deadband/ceiling, inertia precomp and `pid_mode` other than 3. The panel lists any of these your config changes from the default.
- **Saved:** the config is kept in the browser's localStorage and re-applied on your next visit. Slider changes made after loading are not saved; **Reset to config** puts the loaded values back, and **Forget config** removes it.

## Model

Signal path, every part adjustable in the *Heli model* and *Loop & signal chain* panels:

```
gyro ─► gyro LPF ─► Rotorflight yaw PID ─► servo frame ─► servo lag + slew ─► thrust lag ─► yaw dynamics
        100 Hz       1 kHz loop             333 Hz         10 ms, 1000 °/s     10 ms
```

- **Yaw dynamics:** `dr/dt = A·θ_thrust − torque − b·r`, `dψ/dt = r`, with tail authority A = 128 °/s² per degree and yaw damping b = 3 /s. That gives a top piro rate of A·(θmax − trim)/b ≈ 850 °/s.
- **Main-rotor torque** is A × 5° at the 6° hover collective, so the tail needs +5° (the hover trim) just to hold still. It grows with collective² (induced drag). The collective punch raises collective from 6° to about 9.3°, needing about 3° more tail. Torque scales with A, so changing A never leaves the tail unable to hold hover.
- **Tail servo:** first-order lag (10 ms) plus a 1000 °/s slew limit, toward a command clamped to ±θmax. It takes a new position once per servo frame (Rotorflight's default servo update rate, 333 Hz).
- **Thrust lag:** blade pitch takes 10 ms to become thrust (tail-rotor inflow).
- **Gyro LPF:** Rotorflight's default `gyro_lpf1` (first order, 100 Hz) filters the gyro before the PID.
- **Physics:** 0.5 ms steps (semi-implicit Euler). The controller runs at the loop rate (1 kHz by default).

**Why the delays matter.** With only a servo lag in the loop (the original model: A = 64, b = 2, 20 ms servo, no other delays), even P = 1000 was perfectly stable. On a real heli, high tail P wags because the gyro filter, servo frame, servo and thrust lags eat the loop's phase margin. With them in place, P starts to wag at about 600 and I at about 500. Stock (80/120) and the community tune (120/180) are clean, and community out-stops stock.

**These defaults are calibrated, not measured.** A, b and the servo and thrust lags were chosen so that Rotorflight's stock and community tunes, and its published "too much P/I" symptoms, behave as reported for real helicopters. They aren't measurements of a particular airframe. Change them in the *Heli model* panel to match yours; *Reset model* puts them back.
- Each run starts at the hover equilibrium for the current gains and holds still for a 2 s pre-roll, then the pilot input starts at t = 0. The last 0.5 s of the pre-roll is plotted.
- Pilot inputs:
  - **Stick flick (a 90° turn by default):** the pilot holds the yaw stick at the stick rate (360°/s) and centres it a little early, when heading + rate × *let go early* (0.06 s) reaches the yaw angle, to allow for the stop. That's how a real pilot flies a turn. A timed flick can't work here: the tail can't follow a 0.25 s stick, and Rotorflight deliberately doesn't chase the lost heading.
  - **Piro & stop:** the stick is held at the piro rate, then centred.
- Both inputs report stop metrics measured after the stick is centred: drift-on, bounce-back and stop time. For a piro, the heading-tracking tiles (overshoot, steady-state error and so on) are hidden, because a rate controller doesn't try to reach the integrated stick angle.

## The Rotorflight controller

`sim/rotorflight/` is a JavaScript port of Rotorflight's yaw loop, from firmware commit `df6bda6` (Nov 2026):

- **What's ported:** `pidApplyYawMode3` (P with CW/CCW stop gains, D on measured rate, I with I-term relax, error limit and decay, F and B feedforward), the gyro bandwidth filter, the collective/cyclic-to-yaw precomp, the mixer's input limit and 5-cycle saturation flag (which is its anti-windup), and the default yaw profile.
- **Also from Rotorflight's defaults:** the `gyro_lpf1` gyro filter (first order, 100 Hz) and the 333 Hz servo update rate. Both are in the simulator's signal chain.
- **What's not ported:** the stick rates pipeline (the setpoint is given in °/s directly), inertia precomp (headspeed is constant here), ground error decay, dynamic notch/RPM filters, and mixer rules.
- **Units.** Gains are in Rotorflight's own units. Its output is a mixer input where 1.0 = 24° of tail pitch, the configurator's tail override scale.
- **What the gains do.** Rotorflight controls yaw **rate**, not heading. **P** damps rate error (stock P 80 = 0.128° of tail pitch per °/s). **I** integrates rate error into heading hold (stock I 120 = 1.44° of pitch per ° of heading error). **D** acts on yaw acceleration.
- **Torque-model calibration.** The torque model's collective coefficient is set so that Rotorflight's default collective FF (60) matches this model.
- **Assumption.** The CW stop gain is applied when the rate error is positive (tail pushing the nose right). If Rotorflight's internal yaw sign is the opposite, the CW/CCW labels swap.

## Presets

Numbers are for a 360°/s piro held for 1.5 s, or the default 90° turn. Presets change the gains only, never the pilot input. "Stop" values are measured after the stick is centred.

| Preset | Changes from stock | What you should see |
|---|---|---|
| Stock | P 80, I 120, D 10, stop gains 120/80, collective FF 60 | Piro stop takes about 0.34 s, carries on about 28° and bounces back about 7°. The 90° turn peaks at about 97° and settles on 90°. |
| Community | P 120, I 180, D 20, stop gains 180/165 | Crisp stop: about 0.18 s with only about 2° of bounce-back. |
| Soft stops | stop gains 50/50 | Lets go late: bounces back about 17° and wobbles. Takes about 0.8 s to stop. |
| Too much P | P 700 | A fast tail wag (about 9 Hz) that never settles. The tail bangs between its limits. |
| Too much I | I 600 | A slower tail wag (about 5 Hz) that never dies out. |
| Rate mode (I = 0) | I 0 | No heading hold. Main-rotor torque makes it drift steadily (about 16 °/s). |
| Precomp off | collective FF 0, punch on | The collective punch kicks the heading about 2.1°. Collective FF 60 cuts that to about 0.7°. |
| Noisy D | D 100, +5 °/s gyro noise | D acts on acceleration, so noise turns into tail chatter (about 2.7× stock D). |

### Things to try

- **Stop gains:** pin Stock, then try Community and Soft stops on the same piro to compare the stops side by side.
- **The 90° turn:** Stock peaks at about 97° and settles on 90°. Community overshoots less (about 94°). Change *let go early* to see how the pilot's timing interacts with the tune.
- **Loop delays:** load *Too much P*, then set the gyro LPF to 0, the servo update rate to 5000 Hz and the thrust lag to 0. The wag disappears. That's why the model needs those delays.
- **I-term relax** (under *Advanced*): relax stops I from accumulating heading error while the stick is moving, so the heli holds wherever it ends up after the stop. On a gentle 45° turn at 180°/s it holds about 2° short. Untick it and the overshoot goes away.
- **Collective FF:** turn on the collective punch and sweep collective FF from 0 to 100. The kick disappears around 60, and above that it overcompensates.
- **θmax ≈ 6°:** with only 1° of authority above trim, a piro is capped at A·1°/b ≈ 43 °/s, the physical limit.

## Licence

This project is licensed under the **GNU General Public License v3.0 or later** (see `LICENSE`), because `sim/rotorflight/` is a port of [Rotorflight](https://github.com/rotorflight/rotorflight-firmware), which is GPL-3.0-or-later. The ported files carry Rotorflight's licence notice and name the source files they come from.
