// Discrete PID controller for the yaw loop.
//  - derivative on measurement (or on error), first-order low-pass on the D term
//  - conditional-integration anti-windup
//  - output clamped to +-outMax
// Output and each term's contribution are in degrees of tail pitch.

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/**
 * @param cfg   { kp, ki, kd, outMax, dCutoff, dOnError, antiWindup }
 * @param dt    controller period (s)
 * @param init  { integ, meas, sp } starting integrator value, measurement and setpoint
 */
export function createPid(cfg, dt, init) {
  const { kp, ki, kd, outMax, dOnError, antiWindup } = cfg;
  const tauD = cfg.dCutoff > 0 ? 1 / (2 * Math.PI * cfg.dCutoff) : 0;
  const alphaD = dt / (tauD + dt);

  let integ = init.integ;
  let prevMeas = init.meas;
  let prevErr = init.sp - init.meas;
  let dFilt = 0;

  // Latest outputs (reused object; read after each update()).
  const err0 = init.sp - init.meas;
  const out = { P: kp * err0, I: integ, D: 0, uRaw: 0, cmd: 0, saturated: false };
  out.cmd = out.uRaw = clamp(out.P + integ, -outMax, outMax);

  function update(sp, meas) {
    const err = sp - meas;
    out.P = kp * err;

    const raw = dOnError ? (err - prevErr) / dt : -(meas - prevMeas) / dt;
    prevErr = err;
    prevMeas = meas;
    dFilt += alphaD * (raw - dFilt);
    out.D = kd * dFilt;

    out.I = integ;
    out.uRaw = out.P + out.I + out.D;
    out.cmd = clamp(out.uRaw, -outMax, outMax);
    out.saturated = out.uRaw !== out.cmd;

    // Anti-windup: freeze the integrator if it would push further into saturation.
    const dI = ki * err * dt;
    if (!(antiWindup && out.saturated && dI * out.uRaw > 0)) integ += dI;
    return out;
  }

  return { update, out };
}
