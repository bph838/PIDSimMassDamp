// Gain search: find the yaw gains that give the best response to the current pilot input.
//
// Score (lower is better, in "seconds-equivalent"), for the input turned both ways:
//   flick  on the nominal heli: settling time onto the yaw angle (the app's ±2% band,
//          held 0.3 s) + 25 ms per degree of overshoot + 50 ms per degree of final error
//          + 0.3 s × fraction of time the tail is saturated
//   piro   stop time (rate below 10°/s) + 25 ms per degree of bounce-back + 10 ms per degree of drift-on
// With `robust`, every candidate is also run on a weaker, laggier tail (A × 0.75, servo and
// thrust lag × 1.5) and a stronger tail (A × 1.25). There the pilot would adapt when to let
// go, so only the stop is scored. Tail-command activity with 5°/s of gyro noise is free up to
// 2× Rotorflight stock and penalised above that, so D can't be raised for free.
//
// Search: seeded random sampling (log-uniform for gains), then a pattern search from the best few.

import { simulate } from './simulate.js';
import { computeStopMetrics, settleBand } from './metrics.js';
import { RF_YAW_DEFAULTS } from './rotorflight/yawPid.js';

/** Gains the search can tune, and the ranges it searches (all within RF_YAW_LIMITS). */
export const TUNE_RANGES = Object.freeze({
  P: [20, 600], I: [20, 600], D: [0, 150], F: [0, 150],
  cwStopGain: [25, 250], ccwStopGain: [25, 250],
});
export const TUNE_KEYS = Object.keys(TUNE_RANGES);

export const TUNE_EFFORT = Object.freeze({
  quick: { samples: 300, refineTop: 3 },
  thorough: { samples: 1500, refineTop: 6 },
});

const HOLD = 0.3;
const NOISE = 5, NOISE_FREE = 2;

function tailActivity(res) { // mean |change in tail command| per recorded sample after t = 0
  let s = 0, c = 0;
  for (let i = 1; i < res.t.length; i++) if (res.t[i] > 0) { s += Math.abs(res.cmd[i] - res.cmd[i - 1]); c++; }
  return c ? s / c : 0;
}

/**
 * @param base    simulate() parameters for the current setup (scenario, pilot input, heli model)
 * @param robust  also score a weaker/laggier and a stronger tail
 * @returns score(rf, detail?) → number, or { J, cases, noise } with detail
 */
export function createScorer(base, { robust = true } = {}) {
  const flick = base.scenario !== 'piro';
  const common = {
    ...base, punch: false, rateNoise: 0,
    duration: flick ? Math.max(2, base.duration) : base.piroTime + 1.5,
  };
  const models = [{ name: 'nominal', w: robust ? 0.5 : 1, m: {} }];
  if (robust) {
    models.push(
      { name: 'weaker tail', w: 0.25, m: { A: base.A * 0.75, servoTau: base.servoTau * 1.5, thrustTau: base.thrustTau * 1.5 } },
      { name: 'stronger tail', w: 0.25, m: { A: base.A * 1.25 } },
    );
  }
  const noiseParams = { ...common, step: Math.abs(base.step), rateNoise: NOISE };
  const noiseRef = tailActivity(simulate({ ...noiseParams, rf: RF_YAW_DEFAULTS })) || 1;

  function runCase(rf, model, dir) {
    const p = { ...common, ...model.m, rf };
    if (flick) p.step = dir * Math.abs(base.step);
    else p.piroRate = dir * Math.abs(base.piroRate);
    const res = simulate(p);
    const st = computeStopMetrics(res);
    const c = { model: model.name, dir, stop: st?.stopTime ?? null, bounce: st?.bounceBack ?? 0, drift: st?.driftOn ?? 0 };

    if (!flick) {
      c.J = (c.stop ?? 3) + 0.025 * c.bounce + 0.01 * c.drift;
      return c;
    }
    if (model.name !== 'nominal') {
      c.J = (c.stop ?? 3) + 0.025 * c.bounce + 0.3 * (res.stats.satPct / 100);
      return c;
    }
    // Nominal flick: land on the yaw angle, as the app's tiles measure it.
    const { t, psi } = res, n = t.length, S = p.step, band = settleBand(S);
    let os = 0, lastOut = -1, fin = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      if (t[i] < 0) continue;
      os = Math.max(os, dir * (psi[i] - S));
      if (Math.abs(psi[i] - S) > band) lastOut = i;
      if (t[i] >= t[n - 1] - HOLD) { fin += psi[i] - S; cnt++; }
    }
    fin /= cnt;
    c.settle = lastOut < n - 1 && t[n - 1] - t[lastOut + 1] >= HOLD ? Math.max(0, t[lastOut + 1]) : null;
    c.overshoot = os;
    c.finalError = fin;
    c.J = (c.settle ?? 3) + 0.025 * os + 0.05 * Math.abs(fin) + 0.3 * (res.stats.satPct / 100);
    return c;
  }

  return function score(rf, detail = false) {
    let J = 0;
    const cases = [];
    for (const model of models) for (const dir of [1, -1]) {
      const c = runCase(rf, model, dir);
      J += model.w * 0.5 * c.J;
      cases.push(c);
    }
    const noise = tailActivity(simulate({ ...noiseParams, rf })) / noiseRef;
    J += 0.15 * Math.max(0, noise - NOISE_FREE);
    return detail ? { J, cases, noise } : J;
  };
}

/**
 * Search the gains in `keys`, starting from the profile `start`; other values stay as in `start`.
 * @param opts {
 *   base, start, keys = TUNE_KEYS, robust = true, effort = 'quick' (or samples/refineTop),
 *   seed = 1, onProgress({ done, total, bestJ })
 * }
 * @returns {
 *   current   { rf, detail } for the starting gains
 *   results   up to 3 distinct best profiles, best first: { rf, detail }
 *   effects   for the best result: each changed gain, from → to, and how much worse the
 *             score gets if just that gain goes back (sorted, biggest first)
 *   evaluations
 * }
 */
export function searchGains(opts) {
  const { base, start, robust = true, seed = 1, onProgress = () => {} } = opts;
  const keys = (opts.keys ?? TUNE_KEYS).filter((k) => TUNE_KEYS.includes(k));
  const effort = TUNE_EFFORT[opts.effort] ?? TUNE_EFFORT.quick;
  const samples = opts.samples ?? effort.samples, refineTop = opts.refineTop ?? effort.refineTop;
  const score = createScorer(base, { robust });

  const clampX = (x) => {
    const y = { ...x };
    for (const k of keys) y[k] = Math.min(TUNE_RANGES[k][1], Math.max(TUNE_RANGES[k][0], Math.round(x[k])));
    return y;
  };
  let evals = 0, bestJ = Infinity;
  // Each refinement takes roughly 25 evaluations per tuned gain; used for the progress bar only.
  const total = samples + 3 + refineTop * 25 * Math.max(1, keys.length) + keys.length;
  const cache = new Map();
  const J = (x) => {
    const key = keys.map((k) => x[k]).join(',');
    let v = cache.get(key);
    if (v === undefined) {
      v = score(x);
      cache.set(key, v);
      evals++;
      if (v < bestJ) bestJ = v;
      if (evals % 20 === 0) onProgress({ done: Math.min(evals, total - 1), total, bestJ });
    }
    return v;
  };

  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  // ---- random phase (plus the starting gains, Rotorflight stock and a typical community tune)
  const startX = { ...RF_YAW_DEFAULTS, ...start };
  const pool = [clampX(startX), clampX({ ...startX, ...pick(RF_YAW_DEFAULTS, keys) }),
    clampX({ ...startX, ...pick({ P: 120, I: 180, D: 20, F: 0, cwStopGain: 180, ccwStopGain: 165 }, keys) })];
  for (let i = 0; i < samples; i++) {
    const x = { ...startX };
    for (const k of keys) {
      const [lo, hi] = TUNE_RANGES[k];
      x[k] = k.endsWith('StopGain')
        ? lo + rnd() * (hi - lo)
        : Math.exp(Math.log(lo + 1) + rnd() * (Math.log(hi + 1) - Math.log(lo + 1))) - 1;
    }
    pool.push(clampX(x));
  }
  const scored = pool.map((x) => ({ x, J: J(x) })).sort((a, b) => a.J - b.J);

  // ---- pattern search from the best few
  function refine({ x, J: Jx }) {
    let frac = 0.15;
    while (frac > 0.004) {
      let improved = false;
      for (const k of keys) {
        const span = TUNE_RANGES[k][1] - TUNE_RANGES[k][0];
        for (const d of [1, -1]) {
          const y = clampX({ ...x, [k]: x[k] + d * Math.max(1, frac * span) });
          if (y[k] === x[k]) continue;
          const Jy = J(y);
          if (Jy < Jx - 1e-6) { x = y; Jx = Jy; improved = true; break; }
        }
      }
      if (!improved) frac /= 2;
    }
    return { x, J: Jx };
  }
  const refined = scored.slice(0, refineTop).map(refine).sort((a, b) => a.J - b.J);

  // Distinct results: drop any within ~5% of a better one on every tuned gain.
  const results = [];
  for (const r of refined) {
    const near = results.some((q) => keys.every((k) => Math.abs(q.x[k] - r.x[k]) <= 0.05 * (TUNE_RANGES[k][1] - TUNE_RANGES[k][0])));
    if (!near) results.push(r);
    if (results.length === 3) break;
  }

  // ---- what each change contributes: put one gain back and see how much worse it gets
  const best = results[0];
  const effects = keys.filter((k) => best.x[k] !== startX[k]).map((k) => ({
    key: k, from: startX[k], to: best.x[k], worseBy: J({ ...best.x, [k]: startX[k] }) - best.J,
  })).sort((a, b) => b.worseBy - a.worseBy);

  onProgress({ done: total, total, bestJ });
  return {
    current: { rf: startX, detail: score(startX, true) },
    results: results.map((r) => ({ rf: r.x, detail: score(r.x, true) })),
    effects,
    evaluations: evals,
  };
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
