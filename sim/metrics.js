// Step-response metrics from a simulate() result.
// Everything is measured against the final commanded heading (the flick angle,
// or where the piro stick stopped). Rise time is measured from the heading
// just before t = 0 (which may be off-target with P-only).

export const SETTLE_BAND = 0.02;   // +-2% of the commanded yaw...
const SETTLE_BAND_MAX = 2;         // ...but at most +-2 deg (a 540 deg piro would otherwise get +-10.8 deg)

/** Half-width of the settling band (deg) for a commanded yaw of S degrees. */
export const settleBand = (S) => Math.min(SETTLE_BAND * Math.abs(S), SETTLE_BAND_MAX);
const SETTLE_HOLD = 0.3;           // must stay in band this long before the end (s)
const SS_WINDOW = 0.5;             // steady-state error averaging window (s)

export function computeMetrics(res) {
  const { t, psi } = res;
  const S = res.target;
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
  const overshootDeg = Math.max(0, (maxPsi - S) * Math.sign(S));
  const overshoot = (overshootDeg / Math.abs(S)) * 100;

  // Settling: last time outside the band; must then stay in band for SETTLE_HOLD.
  const band = settleBand(S);
  let lastOut = -1;
  for (let i = n - 1; i >= i0; i--) if (Math.abs(psi[i] - S) > band) { lastOut = i; break; }
  let settlingTime = null;
  if (lastOut < n - 1) {
    const ts = lastOut < 0 ? 0 : t[lastOut + 1];
    if (t[n - 1] - ts >= SETTLE_HOLD) settlingTime = ts;
  }

  // Steady-state error: setpoint minus mean heading over the last SS_WINDOW
  // (or the last quarter of a short run, so it doesn't average in the overshoot).
  const tEnd = t[n - 1];
  const win = Math.min(SS_WINDOW, 0.25 * tEnd);
  let sum = 0, cnt = 0;
  for (let i = n - 1; i >= i0 && t[i] >= tEnd - win; i--) { sum += psi[i]; cnt++; }
  const ssError = S - sum / cnt;

  return {
    target: S, psi0, riseTime, overshoot, overshootDeg, settlingTime, ssError,
    peakPitch: res.stats.peakCmd, satPct: res.stats.satPct,
  };
}

const STOPPED_RATE = 10; // deg/s: below this the heli counts as stopped

/**
 * What happens after the yaw stick is centred: the classic tail-tuning view.
 *   rateAtRelease  yaw rate when the stick centred (deg/s)
 *   driftOn        how far the heading carried on past where it was at release (deg)
 *   bounceBack     how far it then came back from that furthest point (deg)
 *   stopTime       time from release until |rate| stays below 10 deg/s (s), null if never
 */
export function computeStopMetrics(res) {
  if (!(res.moveEnd > 0)) return null; // stick never centred
  const { t, psi, rate } = res;
  const n = t.length;
  let iC = 0;
  while (iC < n && t[iC] < res.moveEnd) iC++;
  if (iC >= n) return null;
  const dir = Math.sign(res.rateSp[Math.max(0, iC - 1)]) || 1;
  const psiC = psi[iC];

  let driftOn = 0, iMax = iC;
  for (let i = iC; i < n; i++) {
    const d = (psi[i] - psiC) * dir;
    if (d > driftOn) { driftOn = d; iMax = i; }
  }
  let back = driftOn;
  for (let i = iMax; i < n; i++) back = Math.min(back, (psi[i] - psiC) * dir);

  let stopTime = null;
  let last = n - 1;
  while (last >= iC && Math.abs(rate[last]) <= STOPPED_RATE) last--;
  if (last < n - 1 && t[n - 1] - t[last + 1] >= SETTLE_HOLD) stopTime = t[last + 1] - res.moveEnd;

  return { rateAtRelease: rate[iC], driftOn, bounceBack: driftOn - back, stopTime };
}
