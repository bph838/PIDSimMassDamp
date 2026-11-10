// Scenario runner: pre-roll at setpoint 0, step the setpoint at t = 0, record traces.

import { DEFAULTS } from './defaults.js';
import { makeGaussian } from './noise.js';
import { createPid, clamp } from './pid.js';
import { createHeli, trimPitch, hoverEquilibrium } from './heli.js';

const TRACES = ['t', 'psi', 'sp', 'rate', 'cmd', 'theta', 'p', 'i', 'd', 'dist'];

/**
 * Run one complete scenario. Returns sampled traces (t >= -showPreroll) as
 * Float32Arrays, plus summary stats over the post-step window.
 */
export function simulate(params) {
  const p = { ...DEFAULTS, ...params };
  const dt = p.dt;
  const ctrlEvery = Math.max(1, Math.round(1 / (p.loopRate * dt)));
  const recEvery = Math.max(1, Math.round(p.recordDt / dt));
  const baseTorque = p.mainTorque ? p.Dmain : 0;
  const trim = trimPitch(baseTorque, p.A);
  const gauss = makeGaussian(p.seed);

  const eq = hoverEquilibrium(p, trim) || { psi: 0, theta: 0, integ: 0 };
  const heli = createHeli(p, dt, { psi: eq.psi, r: 0, theta: eq.theta });
  const pid = createPid(
    { kp: p.kp, ki: p.ki, kd: p.kd, outMax: p.thetaMax, dCutoff: p.dCutoff, dOnError: p.dOnError, antiWindup: p.antiWindup },
    ctrlEvery * dt,
    { integ: eq.integ, meas: eq.psi, sp: 0 },
  );
  const s = heli.state, u = pid.out;

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
    const sp = t >= -1e-12 ? p.step : 0;
    const punching = p.punch && t >= p.punchTime;

    // Controller tick
    if (n % ctrlEvery === 0) {
      const meas = s.psi + (p.noise > 0 ? p.noise * gauss() : 0);
      pid.update(sp, meas);
      if (t >= 0) {
        ticksAfter++;
        if (u.saturated) satTicks++;
        if (Math.abs(u.cmd) > peakCmd) peakCmd = Math.abs(u.cmd);
      }
    }

    // Record (zero-order hold of the last controller outputs)
    if (t >= recStart - 1e-9 && k < nRec && n % recEvery === 0) {
      out.t[k] = t; out.psi[k] = s.psi; out.sp[k] = sp; out.rate[k] = s.r;
      out.cmd[k] = u.cmd; out.theta[k] = s.theta;
      out.p[k] = u.P; out.i[k] = u.I; out.d[k] = u.D;
      out.dist[k] = punching ? 1 : 0;
      k++;
    }
    if (n === nSteps) break;

    heli.step(u.cmd, baseTorque + (punching ? p.punchTorque : 0));
    if (t >= 0 && Math.abs(s.r) > peakRate) peakRate = Math.abs(s.r);
  }

  if (k < nRec) for (const key of TRACES) out[key] = out[key].subarray(0, k);

  return {
    params: p,
    trim,
    ...out,
    stats: { peakCmd, satPct: ticksAfter ? (100 * satTicks) / ticksAfter : 0, peakRate },
  };
}

/** Index of the recorded sample nearest to time t. */
export function sampleIndex(res, t) {
  return clamp(Math.round((t - res.t[0]) / res.params.recordDt), 0, res.t.length - 1);
}
