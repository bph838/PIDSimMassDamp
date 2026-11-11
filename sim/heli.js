// Helicopter yaw plant: tail servo + tail rotor thrust + yaw dynamics.
//   servo:   theta follows cmd with a first-order lag (servoTau) and a slew-rate limit
//   thrust:  the tail's effective pitch thetaT follows theta with a first-order lag
//            (thrustTau: blade-pitch change -> inflow -> thrust); 0 = instant
//   yaw:     dr/dt = A*thetaT - torque - b*r,   dpsi/dt = r
// Integrated with semi-implicit Euler (rate first, then heading with the new rate).

import { clamp } from './util.js';

/**
 * @param cfg   { A, b, servoTau, servoRate, thrustTau }
 * @param dt    physics step (s)
 * @param init  { psi, r, theta }
 */
export function createHeli(cfg, dt, init) {
  const { A, b } = cfg;
  const lag = (tau) => (tau > 0 ? 1 - Math.exp(-dt / tau) : 1); // exact first-order lag per step
  const servoK = lag(cfg.servoTau);
  const thrustK = lag(cfg.thrustTau || 0);
  const maxSlew = cfg.servoRate * dt;
  const s = { psi: init.psi, r: init.r, theta: init.theta, thetaT: init.theta };

  /** Advance one physics step with tail command `cmd` and main-rotor torque `torque`. */
  function step(cmd, torque) {
    s.theta += clamp((cmd - s.theta) * servoK, -maxSlew, maxSlew);
    s.thetaT += (s.theta - s.thetaT) * thrustK;
    s.r += (A * s.thetaT - torque - b * s.r) * dt;
    s.psi += s.r * dt;
  }

  return { state: s, step };
}

/** Tail pitch needed to cancel a steady main-rotor torque (deg). */
export const trimPitch = (torque, A) => torque / A;
