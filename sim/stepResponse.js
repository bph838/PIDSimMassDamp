// Yaw-rate step response, as tuning tools like PIDtoolbox show it: the stick jumps to a
// yaw rate at t = 0 and stays there; the response is the measured yaw rate divided by the
// commanded rate (1.0 = the tail does exactly what the stick asks). Run to the right and
// to the left, since the CW/CCW stop gains and main-rotor torque make them differ.

import { simulate } from './simulate.js';

export const STEP_WINDOW = 0.5;   // s after the step
export const STEP_PRE = 0.05;     // s before the step shown on the graph
export const STEP_BAND = 0.05;    // settling band (±5%)
const STEP_HOLD = 0.1;            // must stay in the band this long before the window ends

/**
 * @param params     simulate() parameters for the current setup (pilot input fields are ignored)
 * @param amplitude  step size (deg/s, > 0)
 * @returns { amplitude, right, left }, each {
 *   t, y          time (s) and normalised response (Float32Array)
 *   delay         time to reach 50% (s) or null
 *   rise          10% → 90% time (s) or null
 *   overshoot     peak above 1.0, in % of the step
 *   settle        time after which y stays within ±5% (s) or null
 *   final         mean of y over the last 0.1 s
 * }
 */
export function stepResponse(params, amplitude) {
  const out = { amplitude };
  for (const [key, dir] of [['right', 1], ['left', -1]]) {
    const res = simulate({
      ...params, scenario: 'rateStep', stepRate: dir * amplitude,
      duration: STEP_WINDOW, showPreroll: STEP_PRE, punch: false,
    });
    const { t, rate } = res, n = t.length;
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = rate[i] / (dir * amplitude);

    let delay = null, t10 = null, t90 = null, peak = -Infinity, lastOut = -1, fin = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      if (t[i] < 0) continue;
      if (t10 === null && y[i] >= 0.1) t10 = t[i];
      if (delay === null && y[i] >= 0.5) delay = t[i];
      if (t90 === null && y[i] >= 0.9) t90 = t[i];
      if (y[i] > peak) peak = y[i];
      if (Math.abs(y[i] - 1) > STEP_BAND) lastOut = i;
      if (t[i] >= t[n - 1] - STEP_HOLD) { fin += y[i]; cnt++; }
    }
    const settle = lastOut < n - 1 && t[n - 1] - t[lastOut + 1] >= STEP_HOLD ? Math.max(0, t[lastOut + 1]) : null;
    out[key] = {
      t, y, delay,
      rise: t10 !== null && t90 !== null ? t90 - t10 : null,
      overshoot: Math.max(0, (peak - 1) * 100),
      settle,
      final: cnt ? fin / cnt : 0,
    };
  }
  return out;
}
