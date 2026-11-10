// Pilot inputs over time: what the sticks command during a run.
//   flick  yaw stick held at `flickRate` until the heading command has moved `step` degrees
//   piro   yaw stick held at `piroRate` for `piroTime` seconds, then centred (piro and stop)
// Collective: hover collective, stepping up at `punchTime` when the punch is on.

import { COLLECTIVE_DEG_PER_UNIT } from './rotorflight/yawPid.js';

export const SCENARIOS = ['flick', 'piro'];

/**
 * @returns {
 *   rate(t)     yaw rate command (deg/s)
 *   heading(t)  commanded heading (deg): the integral of rate(t)
 *   moveEnd     time the stick returns to centre (s)
 *   target      final commanded heading (deg)
 * }
 */
export function stickProfile(p) {
  const flick = p.scenario === 'flick';
  const rate = flick ? Math.abs(p.flickRate) * Math.sign(p.step || 1) : p.piroRate;
  const T = flick ? Math.abs(p.step / p.flickRate) : p.piroTime;
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
