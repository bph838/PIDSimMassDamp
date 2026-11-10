// Pilot inputs over time: what the sticks command during a run.
//   flick  turn by `step` degrees: the pilot holds the yaw stick at `flickRate` and
//          centres it when heading + rate × `pilotLead` reaches the target, i.e. lets
//          go a little early to allow for the stop, as a real pilot does
//   piro   yaw stick held at `piroRate` for `piroTime` seconds, then centred (piro and stop)
// Collective: hover collective, stepping up at `punchTime` when the punch is on.

import { COLLECTIVE_DEG_PER_UNIT } from './rotorflight/yawPid.js';

export const SCENARIOS = ['flick', 'piro'];

/**
 * The pilot's yaw stick. Call rate() once per physics step, in time order: the
 * flick pilot watches the heli and decides when to let go.
 * @returns {
 *   rate(t, psi, r)  yaw rate command (deg/s), given the current heading and yaw rate
 *   heading(t)       commanded heading (deg): the turn target for a flick, the
 *                    integral of the stick for a piro
 *   target           final commanded heading (deg)
 *   moveEnd          time the stick returned to centre (s); for a flick, known once
 *                    the pilot has let go (null until then, or if they never do)
 * }
 */
export function stickProfile(p) {
  if (p.scenario === 'flick') {
    const dir = Math.sign(p.step) || 1;
    const rate = Math.abs(p.flickRate) * dir;
    const goal = Math.abs(p.step);
    const stick = {
      target: p.step,
      moveEnd: null,
      heading: (t) => (t >= 0 ? p.step : 0),
      rate(t, psi, r) {
        if (t < 0 || stick.moveEnd !== null) return 0;
        if (dir * (psi + r * p.pilotLead) >= goal) { stick.moveEnd = t; return 0; }
        return rate;
      },
    };
    return stick;
  }
  const rate = p.piroRate, T = p.piroTime;
  return {
    rate: (t) => (t >= 0 && t < T ? rate : 0),
    heading: (t) => rate * Math.min(Math.max(t, 0), T),
    moveEnd: T,
    target: rate * T,
  };
}

/**
 * Main-rotor torque model: profile drag + induced drag ∝ collective².
 *   torque(c) = base + K·(c² − c0²)
 * where base = D_main at hover collective c0 (or 0 with main torque off), and K is
 * `torquePerCollective2` (deg/s² per mixer-unit²). The punch raises collective from
 * c0 to the value that adds exactly `punchTorque` of torque.
 * Collective is in mixer units (1.0 = 12°).
 */
export function collectiveProfile(p) {
  const c0 = p.hoverCollective / COLLECTIVE_DEG_PER_UNIT;
  const K = p.torquePerCollective2;
  const c1 = Math.sqrt(c0 * c0 + p.punchTorque / K);
  const base = p.mainTorque ? p.Dmain : 0;
  const collective = (t) => (p.punch && t >= p.punchTime ? c1 : c0);
  const torque = (c) => (c === c0 ? base : base + K * (c * c - c0 * c0));
  return { collective, torque, hover: c0, punch: c1 };
}
