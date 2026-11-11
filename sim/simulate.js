// Scenario runner: pre-roll in hover, then the pilot input (90° turn or piro)
// at t = 0; record traces for plotting and metrics.

import { DEFAULTS } from './defaults.js';
import { makeGaussian } from './noise.js';
import { clamp } from './util.js';
import { createHeli, trimPitch } from './heli.js';
import { stickProfile, collectiveProfile } from './scenario.js';
import { createRotorflightYawPid } from './rotorflight/yawPid.js';
import { firstOrderLPF } from './rotorflight/filters.js';

const TRACES = ['t', 'psi', 'sp', 'rate', 'rateSp', 'cmd', 'theta', 'p', 'i', 'd', 'f', 'dist'];

/**
 * Run one complete scenario. Returns sampled traces (t >= -showPreroll) as
 * Float32Arrays, plus summary stats over the post-input window.
 */
export function simulate(params) {
  const p = { ...DEFAULTS, ...params };
  const dt = p.dt;
  const ctrlEvery = Math.max(1, Math.round(1 / (p.loopRate * dt)));
  const recEvery = Math.max(1, Math.round(p.recordDt / dt));
  const stick = stickProfile(p);
  const coll = collectiveProfile(p);
  const trim = trimPitch(coll.torque(coll.hover), p.A);
  const gauss = makeGaussian(p.seed);

  // Controller, started in hover. With I = 0 (rate mode) the tail can't hold trim
  // and starts unbalanced; if trim is beyond the tail limit it starts at 0.
  const pid = createRotorflightYawPid(p.rf, 1 / (ctrlEvery * dt), p.thetaMax);
  const theta0 = trim <= p.thetaMax ? pid.initHover(trim, coll.hover) : 0;
  const heli = createHeli(p, dt, { psi: 0, r: 0, theta: theta0 });
  const s = heli.state, u = pid.out;

  // Signal chain around the PID (Rotorflight defaults): gyro_lpf1 low-pass on the gyro
  // before the PID, and the servo only taking a new position every 1/servoRate seconds.
  const pidRate = 1 / (ctrlEvery * dt);
  const gyroLpf = p.gyroLpfHz > 0 ? firstOrderLPF(p.gyroLpfHz, pidRate) : null;
  const servoFrame = p.servoUpdateHz > 0 ? 1 / p.servoUpdateHz : 0;
  let servoCmd = u.cmd, nextServo = -p.preroll;

  const tStart = -p.preroll;
  const nSteps = Math.round((p.preroll + p.duration) / dt);
  const recStart = -p.showPreroll;
  const nRec = Math.floor((p.duration - recStart) / (recEvery * dt) + 1e-9) + 1;
  const out = {};
  for (const k of TRACES) out[k] = new Float32Array(nRec);
  let k = 0;

  let ticksAfter = 0, satTicks = 0, peakCmd = 0, peakRate = 0;

  for (let n = 0; n <= nSteps; n++) {
    const t = tStart + n * dt;
    const sp = stick.heading(t);
    const rateSp = stick.rate(t, s.psi, s.r);
    const c = coll.collective(t);

    // Controller tick
    if (n % ctrlEvery === 0) {
      const raw = s.r + (p.rateNoise > 0 ? p.rateNoise * gauss() : 0);
      const gyro = gyroLpf ? gyroLpf.apply(raw) : raw;
      pid.update(rateSp, gyro, c);
      if (t >= 0) {
        ticksAfter++;
        if (u.saturated) satTicks++;
        if (Math.abs(u.cmd) > peakCmd) peakCmd = Math.abs(u.cmd);
      }
    }

    // Record (zero-order hold of the last controller outputs)
    if (t >= recStart - 1e-9 && k < nRec && n % recEvery === 0) {
      out.t[k] = t; out.psi[k] = s.psi; out.sp[k] = sp; out.rate[k] = s.r; out.rateSp[k] = rateSp;
      out.cmd[k] = u.cmd; out.theta[k] = s.theta;
      out.p[k] = u.P; out.i[k] = u.I; out.d[k] = u.D; out.f[k] = u.F;
      out.dist[k] = c !== coll.hover ? 1 : 0;
      k++;
    }
    if (n === nSteps) break;

    // Servo frame: latch the latest command at the servo update rate (0 = every step).
    if (!servoFrame) servoCmd = u.cmd;
    else if (t >= nextServo - 1e-12) { servoCmd = u.cmd; nextServo += servoFrame; }
    heli.step(servoCmd, coll.torque(c));
    if (t >= 0 && Math.abs(s.r) > peakRate) peakRate = Math.abs(s.r);
  }

  if (k < nRec) for (const key of TRACES) out[key] = out[key].subarray(0, k);

  return {
    params: p,
    trim,
    target: stick.target,     // final commanded heading: the turn angle (flick) or stick integral (piro)
    moveEnd: stick.moveEnd,   // when the stick returned to centre (null if it never did)
    collective: { hover: coll.hover, punch: coll.punch },
    ...out,
    stats: { peakCmd, satPct: ticksAfter ? (100 * satTicks) / ticksAfter : 0, peakRate },
  };
}

/** Index of the recorded sample nearest to time t. */
export function sampleIndex(res, t) {
  return clamp(Math.round((t - res.t[0]) / res.params.recordDt), 0, res.t.length - 1);
}
