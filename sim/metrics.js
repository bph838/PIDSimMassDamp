// Step-response metrics from a simulate() result.
// Thresholds are relative to the setpoint step; rise time is measured from
// the heading just before the step (which may be off-target with P-only).

export const SETTLE_BAND = 0.02;   // +-2% of the step
const SETTLE_HOLD = 0.3;           // must stay in band this long before the end (s)
const SS_WINDOW = 0.5;             // steady-state error averaging window (s)

export function computeMetrics(res) {
  const { t, psi, params } = res;
  const S = params.step;
  const n = t.length;
  let i0 = 0;
  while (i0 < n && t[i0] < 0) i0++;
  const psi0 = psi[Math.max(0, i0 - 1)];
  const span = S - psi0;

  // Rise time: 10% -> 90% of the way from psi0 to the setpoint.
  let t10 = null, t90 = null;
  for (let i = i0; i < n; i++) {
    const f = (psi[i] - psi0) / span;
    if (t10 === null && f >= 0.1) t10 = t[i];
    if (t90 === null && f >= 0.9) { t90 = t[i]; break; }
  }
  const riseTime = t10 !== null && t90 !== null ? t90 - t10 : null;

  let maxPsi = -Infinity;
  for (let i = i0; i < n; i++) if (psi[i] > maxPsi) maxPsi = psi[i];
  const overshoot = Math.max(0, ((maxPsi - S) / S) * 100);

  // Settling: last time outside the band; must then stay in band for SETTLE_HOLD.
  const band = SETTLE_BAND * Math.abs(S);
  let lastOut = -1;
  for (let i = n - 1; i >= i0; i--) if (Math.abs(psi[i] - S) > band) { lastOut = i; break; }
  let settlingTime = null;
  if (lastOut < n - 1) {
    const ts = lastOut < 0 ? 0 : t[lastOut + 1];
    if (t[n - 1] - ts >= SETTLE_HOLD) settlingTime = ts;
  }

  // Steady-state error: setpoint minus mean heading over the last SS_WINDOW.
  const tEnd = t[n - 1];
  let sum = 0, cnt = 0;
  for (let i = n - 1; i >= i0 && t[i] >= tEnd - SS_WINDOW; i--) { sum += psi[i]; cnt++; }
  const ssError = S - sum / cnt;

  return {
    psi0, riseTime, overshoot, settlingTime, ssError,
    peakPitch: res.stats.peakCmd, satPct: res.stats.satPct,
  };
}
