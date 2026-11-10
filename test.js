// test.js — headless checks for the sim/ package.  Run with:  node test.js
import { simulate, computeMetrics, PRESETS } from './sim/index.js';

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!cond) failures++;
}
const fmt = (x, d = 2) => (x === null || x === undefined ? 'n/a' : x.toFixed(d));

// Extra measures used by the checks below.
function swing(res, fromT) {          // peak-to-peak heading after fromT
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < res.t.length; i++) if (res.t[i] >= fromT) { lo = Math.min(lo, res.psi[i]); hi = Math.max(hi, res.psi[i]); }
  return hi - lo;
}
function chatter(res, fromT) {        // mean |change in tail command| per 1 ms sample
  let s = 0, c = 0;
  for (let i = 1; i < res.t.length; i++) if (res.t[i] >= fromT) { s += Math.abs(res.cmd[i] - res.cmd[i - 1]); c++; }
  return s / c;
}
function run(params) { const res = simulate(params); return { res, m: computeMetrics(res) }; }

// ---------------------------------------------------------------- presets
console.log('\nPreset metrics (45° step, 4 s, defaults otherwise)\n');
console.log('preset        Kp    Ki    Kd   | pre-step  rise(s)  overshoot  settle(s)  ss-err  peak-pitch  sat%  swing@3-4s  chatter');
const R = {};
for (const pr of PRESETS) {
  const { res, m } = run(pr);
  R[pr.id] = { res, m };
  console.log(
    `${pr.name.padEnd(12)} ${String(pr.kp).padStart(4)} ${String(pr.ki).padStart(5)} ${String(pr.kd).padStart(5)}  |` +
    ` ${fmt(m.psi0, 1).padStart(7)}° ${fmt(m.riseTime, 3).padStart(8)} ${(fmt(m.overshoot, 1) + '%').padStart(10)}` +
    ` ${(m.settlingTime === null ? 'no settle' : fmt(m.settlingTime, 3)).padStart(10)} ${fmt(m.ssError, 2).padStart(7)}°` +
    ` ${fmt(m.peakPitch, 1).padStart(10)}° ${fmt(m.satPct, 1).padStart(5)}` +
    ` ${fmt(swing(res, 3), 1).padStart(10)}° ${fmt(chatter(res, 2), 3).padStart(8)}`);
}

console.log('\nPreset behaviour');
{
  const { m, res } = R.p;
  check('P only: sits ~10° off target before the step', Math.abs(m.psi0 + 10) < 0.2, `psi0 = ${fmt(m.psi0)}`);
  check('P only: overshoots 35-60%', m.overshoot > 35 && m.overshoot < 60, `${fmt(m.overshoot, 1)}%`);
  check('P only: oscillates (swing > 3° in the last second)', swing(res, 3) > 3, `${fmt(swing(res, 3), 1)}°`);
  check('P only: settles short (ss error 8-12°)', m.ssError > 8 && m.ssError < 12, `${fmt(m.ssError)}°`);
}
{
  const { m, res } = R.pi;
  const long = simulate({ ...PRESETS.find(p => p.id === 'pi'), duration: 12 });
  const lm = computeMetrics(long);
  check('PI: no offset before the step', Math.abs(m.psi0) < 0.05, `psi0 = ${fmt(m.psi0)}`);
  check('PI: very oscillatory (overshoot > 50%, swing > 10° at 3-4 s)', m.overshoot > 50 && swing(res, 3) > 10,
    `${fmt(m.overshoot, 1)}%, swing ${fmt(swing(res, 3), 1)}°`);
  check('PI: stable — error goes away on a 12 s run', Math.abs(lm.ssError) < 0.5 && swing(long, 11) < 2,
    `ss ${fmt(lm.ssError)}°, swing ${fmt(swing(long, 11), 2)}°`);
}
{
  const { m } = R.pd;
  check('PD: well damped (overshoot < 15%)', m.overshoot < 15, `${fmt(m.overshoot, 1)}%`);
  check('PD: settles ~5° short', Math.abs(m.ssError - 5) < 0.3, `${fmt(m.ssError)}°`);
}
{
  const { m } = R.good;
  check('Good PID: ~10% overshoot (5-15%)', m.overshoot > 5 && m.overshoot < 15, `${fmt(m.overshoot, 1)}%`);
  check('Good PID: settles in under 1 s', m.settlingTime !== null && m.settlingTime < 1, `${fmt(m.settlingTime, 3)} s`);
  check('Good PID: on target', Math.abs(m.ssError) < 0.2, `${fmt(m.ssError, 3)}°`);
}
{
  const { m, res } = R.hiP;
  check('Too much P: rings (overshoot > 25%)', m.overshoot > 25, `${fmt(m.overshoot, 1)}%`);
  check('Too much P: saturates the tail far more than Good PID (> 3×)', m.satPct > 3 * R.good.m.satPct,
    `${fmt(m.satPct, 1)}% vs ${fmt(R.good.m.satPct, 1)}%`);
  check('Too much P: still fast (rise < 0.25 s)', m.riseTime < 0.25, `${fmt(m.riseTime, 3)} s`);
}
{
  const { m, res } = R.hiI;
  check('Too much I: big overshoot (> 40%)', m.overshoot > 40, `${fmt(m.overshoot, 1)}%`);
  check('Too much I: still wallowing at 3-4 s (swing > 3°)', swing(res, 3) > 3, `${fmt(swing(res, 3), 1)}°`);
  check('Too much I: does not settle in 4 s', m.settlingTime === null);
}
{
  const { m, res } = R.hiD;
  const goodNoisy = simulate({ ...PRESETS.find(p => p.id === 'good'), noise: 0.02 });
  check('Too much D: sluggish (rise > 2× Good PID)', m.riseTime > 2 * R.good.m.riseTime,
    `${fmt(m.riseTime, 3)} s vs ${fmt(R.good.m.riseTime, 3)} s`);
  check('Too much D: tail chatters > 3× Good PID at the same noise', chatter(res, 2) > 3 * chatter(goodNoisy, 2),
    `${fmt(chatter(res, 2), 2)} vs ${fmt(chatter(goodNoisy, 2), 2)} °/ms`);
}

// ---------------------------------------------------------------- sanity checks
console.log('\nSanity checks');
{
  const { m } = run({ kp: 2, ki: 0, kd: 0.2 });
  check('Ki = 0 → non-zero steady-state error (≈ 5°/Kp = 2.5°)', Math.abs(m.ssError - 2.5) < 0.1, `${fmt(m.ssError, 3)}°`);
}
{
  const { m } = run({ kp: 2, ki: 0, kd: 0.2, mainTorque: false });
  check('D_main = 0 and Ki = 0 → steady-state error vanishes', Math.abs(m.ssError) < 0.01, `${fmt(m.ssError, 4)}°`);
}
{
  // theta_max = 6°: only 1° above the 5° trim → top rate (64·6 − 320)/2 = 32 °/s.
  // A 180° step so most of the move happens at that terminal rate (yaw time constant 1/b = 0.5 s).
  const { res, m } = run({ kp: 2, ki: 3, kd: 0.2, thetaMax: 6, step: 180, duration: 8 });
  const rates = [];
  for (let i = 0; i < res.t.length; i++) {
    const f = res.psi[i] / 180;
    if (res.t[i] > 0 && f > 0.2 && f < 0.8) rates.push(res.rate[i]);
  }
  const lo = Math.min(...rates), hi = Math.max(...rates);
  check('Tiny θ_max → straight ramp at ≈32 °/s (rate constant within ±5%)',
    rates.length > 100 && lo > 32 * 0.95 && hi < 32 * 1.05, `rate ${fmt(lo, 1)}…${fmt(hi, 1)} °/s`);
  check('Tiny θ_max → tail saturated most of the move', m.satPct > 25, `${fmt(m.satPct, 1)}%`);
}
{
  const meas = simulate({ kp: 2, ki: 3, kd: 0.2 });
  const err = simulate({ kp: 2, ki: 3, kd: 0.2, dOnError: true });
  const peakD = r => { let x = 0; for (let i = 0; i < r.t.length; i++) if (r.t[i] >= 0 && r.t[i] < 0.02) x = Math.max(x, Math.abs(r.d[i])); return x; };
  check('Derivative on error → kick at the step (D term > 10× derivative-on-measurement)',
    peakD(err) > 10 * peakD(meas), `${fmt(peakD(err), 0)}° vs ${fmt(peakD(meas), 1)}°`);
}
{
  const on = computeMetrics(simulate({ kp: 2, ki: 3, kd: 0.2, step: 180 }));
  const off = computeMetrics(simulate({ kp: 2, ki: 3, kd: 0.2, step: 180, antiWindup: false }));
  check('Anti-windup off → more overshoot on a 180° step', off.overshoot > on.overshoot + 5,
    `${fmt(off.overshoot, 1)}% vs ${fmt(on.overshoot, 1)}%`);
}
{
  const base = computeMetrics(simulate({ kp: 2, ki: 3, kd: 0.2 }));
  const res = simulate({ kp: 2, ki: 3, kd: 0.2, punch: true, punchTime: 2 });
  let dip = 0; for (let i = 0; i < res.t.length; i++) if (res.t[i] > 2) dip = Math.max(dip, 45 - res.psi[i]);
  const m = computeMetrics(res);
  check('Collective punch → heading knocked back, then recovers', dip > 1 && Math.abs(m.ssError) < 0.5,
    `dip ${fmt(dip)}°, final error ${fmt(m.ssError, 3)}° (baseline ${fmt(base.ssError, 3)}°)`);
}
{
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) simulate({ kp: 2, ki: 3, kd: 0.2, duration: 4 });
  const ms = (performance.now() - t0) / 20;
  check('Fast enough to re-run on every slider change', ms < 20, `${fmt(ms, 1)} ms per run`);
}

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nAll checks passed\n');
process.exitCode = failures ? 1 : 0;
