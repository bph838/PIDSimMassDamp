// test.js — headless checks for the sim/ package.  Run with:  node test.js
import {
  simulate, computeMetrics, computeStopMetrics, PRESETS,
  createRotorflightYawPid, RF_YAW_DEFAULTS, RF_YAW_LIMITS,
} from './sim/index.js';
import { difFilter, firstOrderLPF, pt1Filter, transition } from './sim/rotorflight/filters.js';

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
function lastSecondDrift(res) {       // heading change over the final second (deg)
  const n = res.t.length;
  return res.psi[n - 1] - res.psi[n - 1001];
}

// ---------------------------------------------------------------- ported primitives
console.log('\nRotorflight port: primitives');
{
  // difFilter: a ramp of slope 50/s must differentiate to ~50 once the filter settles
  const df = difFilter(20, 1000);
  let y = 0; for (let n = 0; n < 2000; n++) y = df.apply(50 * n / 1000);
  check('difFilter differentiates a ramp (50/s)', Math.abs(y - 50) < 0.01, `${fmt(y, 4)}`);
  // first-order LPF: unity DC gain, and -3 dB at the cutoff
  const lp = firstOrderLPF(10, 1000);
  let z = 0; for (let n = 0; n < 5000; n++) z = lp.apply(1);
  check('firstOrderLPF has unity DC gain', Math.abs(z - 1) < 1e-6, fmt(z, 6));
  const lp2 = firstOrderLPF(10, 1000);
  let peak = 0;
  for (let n = 0; n < 20000; n++) { const v = lp2.apply(Math.sin(2 * Math.PI * 10 * n / 1000)); if (n > 10000) peak = Math.max(peak, v); }
  check('firstOrderLPF is -3 dB at its cutoff', Math.abs(peak - Math.SQRT1_2) < 0.01, fmt(peak, 3));
  const p1 = pt1Filter(10, 1000);
  let q = 0; for (let n = 0; n < 5000; n++) q = p1.apply(2);
  check('pt1Filter settles to its input', Math.abs(q - 2) < 1e-6, fmt(q, 6));
  check('transition() maps -10..10 onto CCW..CW stop gain',
    transition(-20, -10, 10, 0.8, 1.2) === 0.8 && transition(20, -10, 10, 0.8, 1.2) === 1.2 &&
    Math.abs(transition(0, -10, 10, 0.8, 1.2) - 1) < 1e-12);
}
{
  // Term scaling: a 100 deg/s rate error with stock P 80 and CW stop gain 1.2
  // gives P = 0.00006666666 * 80 * 100 * 1.2 mixer units, x24 for degrees.
  const c = createRotorflightYawPid({ gyroCutoff: 0, itermRelax: false, I: 0, D: 0 }, 1000, 45);
  c.initHover(0, 0);
  const out = c.update(100, 0, 0);
  const expectP = 0.00006666666 * 80 * 100 * 1.2 * 24;
  check('P term matches pid.c scaling (stock P 80, 100°/s error)', Math.abs(out.P - expectP) < 1e-9,
    `${fmt(out.P, 4)}° vs ${fmt(expectP, 4)}°`);
  // I term: 10 deg/s of error for 1 s accumulates 10 deg of axisError -> I = 0.0005*120*10 units
  const ci = createRotorflightYawPid({ gyroCutoff: 0, itermRelax: false, P: 0, D: 0 }, 1000, 45);
  ci.initHover(0, 0);
  let o; for (let n = 0; n < 1000; n++) o = ci.update(10, 0, 0);
  const expectI = 0.0005 * 120 * 10 * 24;
  check('I term matches pid.c scaling (stock I 120, 10° accumulated)', Math.abs(o.I - expectI) < 0.02,
    `${fmt(o.I, 3)}° vs ${fmt(expectI, 3)}°`);
  // Precomp: collective deflection 0.5 (6 deg) with FF 60 -> (0.3)^2 units = 2.16 deg once filtered
  const cp = createRotorflightYawPid({ P: 0, I: 0, D: 0 }, 1000, 45);
  let pc; for (let n = 0; n < 3000; n++) pc = cp.update(0, 0, 0.5);
  check('Collective precomp matches pid.c (6° collective, FF 60 → 2.16°)', Math.abs(pc.F - 2.16) < 0.01, `${fmt(pc.F, 3)}°`);
  // Mixer saturation: the PID reads the mixer's flag from the previous cycle (as in the
  // firmware), so exactly one tick integrates before the freeze: 500 °/s × 1 ms × Ki.
  const cs = createRotorflightYawPid({ P: 2000, itermRelax: false }, 1000, 5);
  cs.initHover(0, 0);
  cs.update(500, 0, 0);
  const iAfterFirst = cs.out.I;
  for (let n = 0; n < 50; n++) cs.update(500, 0, 0);
  check('Mixer clamp holds output at the tail limit', Math.abs(cs.out.cmd - 5) < 1e-9 && cs.out.saturated, fmt(cs.out.cmd, 3));
  check('I term frozen while saturated (one tick of lag, then no growth)',
    Math.abs(iAfterFirst - 0.0005 * 120 * 0.5 * 24) < 1e-9 && cs.out.I === iAfterFirst, `${fmt(cs.out.I, 4)}° after 51 ticks`);
}

// ---------------------------------------------------------------- Rotorflight value ranges
console.log('\nRotorflight value ranges');
{
  const bad = [];
  const profiles = [['defaults', RF_YAW_DEFAULTS], ...PRESETS.map((p) => [p.name, p.rf])];
  for (const [name, prof] of profiles) {
    for (const [k, [lo, hi]] of Object.entries(RF_YAW_LIMITS)) {
      const v = prof[k];
      if (!Number.isInteger(v) || v < lo || v > hi) bad.push(`${name}.${k}=${v} (allowed ${lo}..${hi})`);
    }
  }
  check('Defaults and every preset are whole numbers inside Rotorflight’s limits', bad.length === 0, bad.join('; '));
  check('Every numeric profile value has a limit', Object.keys(RF_YAW_DEFAULTS)
    .filter((k) => typeof RF_YAW_DEFAULTS[k] === 'number').every((k) => k in RF_YAW_LIMITS));
  // Extremes must still simulate: cutoffs at 0 (filters off), and everything at its maximum.
  const finite = (r) => r.psi.every(Number.isFinite) && r.cmd.every(Number.isFinite);
  const zeroCut = { ...RF_YAW_DEFAULTS, gyroCutoff: 0, dtermCutoff: 0, btermCutoff: 0, precompCutoff: 0 };
  check('Cutoffs at 0 (filters off) run cleanly', finite(simulate({ rf: zeroCut })) && finite(simulate({ scenario: 'piro', rf: zeroCut })));
  const maxed = { ...RF_YAW_DEFAULTS };
  for (const [k, [, hi]] of Object.entries(RF_YAW_LIMITS)) maxed[k] = hi;
  check('Every value at its Rotorflight maximum runs cleanly', finite(simulate({ rf: maxed })) && finite(simulate({ scenario: 'piro', rf: maxed })));
}

// ---------------------------------------------------------------- presets
console.log('\nPresets (stop columns are measured after the stick is centred)\n');
console.log('preset              scenario |  overshoot  ss-err | at release  drift-on  bounce   stop time | sat%  swing@2.5-4s  chatter');
const R = {};
for (const pr of PRESETS) {
  const res = simulate({ rf: pr.rf, scenario: pr.scenario, punch: !!pr.punch, rateNoise: pr.rateNoise || 0 });
  const m = computeMetrics(res), sm = computeStopMetrics(res);
  R[pr.id] = { res, m, sm };
  console.log(
    `${pr.name.padEnd(18)} ${pr.scenario.padStart(9)} | ${(fmt(m.overshootDeg, 1) + '°').padStart(9)} ${(fmt(m.ssError, 2) + '°').padStart(7)} |` +
    ` ${(fmt(sm.rateAtRelease, 0) + '°/s').padStart(10)} ${(fmt(sm.driftOn, 1) + '°').padStart(8)} ${(fmt(sm.bounceBack, 1) + '°').padStart(7)}` +
    ` ${(sm.stopTime === null ? 'never' : fmt(sm.stopTime, 2) + ' s').padStart(10)} | ${fmt(m.satPct, 1).padStart(4)}` +
    ` ${(fmt(swing(res, 2.5), 2) + '°').padStart(13)} ${fmt(chatter(res, 2), 3).padStart(8)}`);
}

console.log('\nPreset behaviour');
{
  const s = R.stock.sm, c = R.community.sm, soft = R.soft.sm;
  check('Stock: piro stop bounces back 4-10°', s.bounceBack > 4 && s.bounceBack < 10, `${fmt(s.bounceBack)}°`);
  check('Community: crisper stop than stock (bounce < 3°, faster stop)', c.bounceBack < 3 && c.stopTime < s.stopTime,
    `${fmt(c.bounceBack)}° in ${fmt(c.stopTime, 2)} s vs ${fmt(s.bounceBack)}° in ${fmt(s.stopTime, 2)} s`);
  check('Soft stops: much more bounce-back than stock (> 12°)', soft.bounceBack > 12, `${fmt(soft.bounceBack)}°`);
  check('Soft stops: slower to stop than stock', soft.stopTime === null || soft.stopTime > s.stopTime,
    soft.stopTime === null ? 'never' : `${fmt(soft.stopTime, 2)} s`);
}
{
  const rateSwing = (r) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < r.t.length; i++) if (r.t[i] >= 2.5) { lo = Math.min(lo, r.rate[i]); hi = Math.max(hi, r.rate[i]); } return hi - lo; };
  const wagHz = (r) => {               // zero crossings of yaw rate about its mean, after 2.5 s
    let sum = 0, c = 0; for (let i = 0; i < r.t.length; i++) if (r.t[i] >= 2.5) { sum += r.rate[i]; c++; }
    const m = sum / c; let z = 0, prev = 0;
    for (let i = 0; i < r.t.length; i++) if (r.t[i] >= 2.5) { const sg = Math.sign(r.rate[i] - m); if (sg && prev && sg !== prev) z++; if (sg) prev = sg; }
    return z / 2 / (r.t[r.t.length - 1] - 2.5);
  };
  const hp = R.hiP.res, hi = R.hiI.res;
  check('Too much P: fast tail wag that never settles (> 30°/s swing)', rateSwing(hp) > 30, `${fmt(rateSwing(hp), 1)}°/s at ~${fmt(wagHz(hp), 1)} Hz`);
  check('Too much I: tail wag that never settles (> 30°/s swing)', rateSwing(hi) > 30, `${fmt(rateSwing(hi), 1)}°/s at ~${fmt(wagHz(hi), 1)} Hz`);
  check('P wag is faster than I wag', wagHz(hp) > 1.5 * wagHz(hi), `${fmt(wagHz(hp), 1)} Hz vs ${fmt(wagHz(hi), 1)} Hz`);
  check('Stock and Community have no wag', rateSwing(simulate({ scenario: 'flick' })) < 1 &&
    rateSwing(simulate({ scenario: 'flick', rf: PRESETS.find((p) => p.id === 'community').rf })) < 1);
  // The wag comes from loop delay: same P 700 with the gyro filter, servo frame and
  // thrust lag removed is stable. (This is why the model needs those delays.)
  const noDelay = simulate({ scenario: 'flick', rf: R.hiP.res.params.rf, gyroLpfHz: 0, servoUpdateHz: 0, thrustTau: 0 });
  check('Too much P: wag disappears when the loop delays are removed', rateSwing(noDelay) < 1, `${fmt(rateSwing(noDelay), 2)}°/s`);
}
{
  const drift = lastSecondDrift(R.rateMode.res);
  check('Rate mode: no heading hold — drifts with main-rotor torque (> 10°/s)', Math.abs(drift) > 10, `${fmt(drift)}°/s over the last second`);
}
{
  const dip = (r) => {
    const i0 = Math.round((2 - r.t[0]) / 0.001);
    let d = 0; for (let i = i0; i < r.t.length; i++) d = Math.max(d, r.psi[i0] - r.psi[i]);
    return d;
  };
  const off = dip(R.noPrecomp.res);
  const on = dip(simulate({ scenario: 'flick', punch: true }));
  check('Precomp: collective FF 60 cuts the punch kick by > 2.5× vs FF 0', off > 2.5 * on, `${fmt(off, 2)}° vs ${fmt(on, 2)}°`);
}
{
  const noisyD = chatter(R.noisyD.res, 2);
  const stockNoisy = chatter(simulate({ scenario: 'flick', rateNoise: 5 }), 2);
  check('Noisy D: tail chatter > 2× stock D at the same noise', noisyD > 2 * stockNoisy, `${fmt(noisyD, 3)} vs ${fmt(stockNoisy, 3)} °/ms`);
}

// ---------------------------------------------------------------- sanity checks
console.log('\nSanity checks');
{
  const m = computeMetrics(simulate({ scenario: 'flick' }));
  check('Stock flick: starts level at hover (I carries the trim)', Math.abs(m.psi0) < 0.01, `psi0 = ${fmt(m.psi0, 4)}`);
}
{
  // Default 90° turn: the pilot holds 360°/s and lets go 0.06 s early to allow for the stop.
  const peak = (r) => { let pk = -Infinity; for (const v of r.psi) pk = Math.max(pk, v); return pk; };
  const comm = simulate({ scenario: 'flick', rf: PRESETS.find((p) => p.id === 'community').rf });
  const stock = simulate({ scenario: 'flick' });
  check('90° turn: pilot lets go before the heli reaches 90°', stock.moveEnd > 0 && stock.psi[Math.round((stock.moveEnd - stock.t[0]) / 0.001)] < 90,
    `released at ${fmt(stock.moveEnd, 2)} s`);
  check('90° turn: Stock settles within 2° of 90°', Math.abs(computeMetrics(stock).ssError) < 2, `${fmt(90 - computeMetrics(stock).ssError, 1)}°`);
  check('90° turn: Community overshoots less than Stock', peak(comm) < peak(stock),
    `peak ${fmt(peak(comm), 1)}° vs ${fmt(peak(stock), 1)}°`);
}
{
  // I-term relax, on a flick gentle enough that the heli keeps up (45° at 180°/s).
  const gentle = { scenario: 'flick', step: 45, flickRate: 180 };
  const m = computeMetrics(simulate(gentle));
  check('Gentle flick: I-term relax means it holds a little short (0.5-5°)', m.ssError > 0.5 && m.ssError < 5, `${fmt(m.ssError, 2)}°`);
  const noRelax = computeMetrics(simulate({ ...gentle, rf: { ...RF_YAW_DEFAULTS, itermRelax: false } }));
  check('Gentle flick: without I-term relax it overshoots less', noRelax.overshootDeg < m.overshootDeg,
    `${fmt(noRelax.overshootDeg, 1)}° vs ${fmt(m.overshootDeg, 1)}°`);
}
{
  // Rate-mode drift comes entirely from main-rotor torque: remove the torque (and the
  // precomp that would otherwise push against nothing) and the heli holds still.
  const r = simulate({ scenario: 'flick', mainTorque: false, rf: { ...RF_YAW_DEFAULTS, I: 0, collectiveFF: 0 } });
  check('Rate mode with no main-rotor torque: no drift', Math.abs(lastSecondDrift(r)) < 0.01, `${fmt(lastSecondDrift(r), 4)}°/s`);
}
{
  // theta_max = 6°: only 1° above the 5° trim → top rate A·(6 − 5)/b,
  // so a 360 °/s piro command becomes a straight ramp at that rate.
  const r = simulate({ scenario: 'piro', piroRate: 360, piroTime: 6, duration: 6, thetaMax: 6 });
  const top = (r.params.A * (6 - r.params.hoverTrim)) / r.params.b;
  const rates = [];
  for (let i = 0; i < r.t.length; i++) if (r.t[i] > 2 && r.t[i] < 5.5) rates.push(r.rate[i]);
  const lo = Math.min(...rates), hi = Math.max(...rates);
  check(`Tiny θ_max → yaw rate capped at A·1°/b ≈ ${fmt(top, 1)} °/s (within ±5%)`, lo > top * 0.95 && hi < top * 1.05,
    `rate ${fmt(lo, 1)}…${fmt(hi, 1)} °/s`);
  check('Tiny θ_max → tail saturated most of the piro', computeMetrics(r).satPct > 50, `${fmt(computeMetrics(r).satPct, 1)}%`);
}
{
  const res = simulate({ scenario: 'flick', punch: true, punchTime: 2 });
  const m = computeMetrics(res), base = computeMetrics(simulate({ scenario: 'flick' }));
  check('Collective punch → heading recovers to where it was holding', Math.abs(m.ssError - base.ssError) < 0.5,
    `final error ${fmt(m.ssError, 3)}° vs ${fmt(base.ssError, 3)}° without the punch`);
}
{
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) simulate({ scenario: 'piro' });
  const ms = (performance.now() - t0) / 20;
  check('Fast enough to re-run on every slider change', ms < 20, `${fmt(ms, 1)} ms per run`);
}

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nAll checks passed\n');
process.exitCode = failures ? 1 : 0;
