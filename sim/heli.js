// Helicopter yaw plant: tail servo + yaw dynamics.
//   servo:  theta follows cmd with a first-order lag (tau) and a slew-rate limit
//   yaw:    dr/dt = A*theta - torque - b*r,   dpsi/dt = r
// Integrated with semi-implicit Euler (rate first, then heading with the new rate).

import { clamp } from './pid.js';

/**
 * @param cfg   { A, b, servoTau, servoRate }
 * @param dt    physics step (s)
 * @param init  { psi, r, theta }
 */
export function createHeli(cfg, dt, init) {
  const { A, b } = cfg;
  const lagK = cfg.servoTau > 0 ? 1 - Math.exp(-dt / cfg.servoTau) : 1; // exact first-order lag per step
  const maxSlew = cfg.servoRate * dt;
  const s = { psi: init.psi, r: init.r, theta: init.theta };

  /** Advance one physics step with tail command `cmd` and main-rotor torque `torque`. */
  function step(cmd, torque) {
    s.theta += clamp((cmd - s.theta) * lagK, -maxSlew, maxSlew);
    s.r += (A * s.theta - torque - b * s.r) * dt;
    s.psi += s.r * dt;
  }

  return { state: s, step };
}

/** Tail pitch needed to cancel a steady main-rotor torque (deg). */
export const trimPitch = (torque, A) => torque / A;

/**
 * Hover equilibrium for given gains, so a run can start already settled.
 * With Ki > 0 the integrator carries the trim and the heading sits on target.
 * With Ki = 0 the heading settles where Kp * error supplies the trim
 * (the P-only steady-state error). Returns null if no equilibrium exists.
 */
export function hoverEquilibrium({ kp, ki, thetaMax }, trim) {
  if (trim > thetaMax) return null;
  if (ki > 0) return { psi: 0, theta: trim, integ: trim };
  if (kp > 0) return { psi: -trim / kp, theta: trim, integ: 0 };
  return null;
}
