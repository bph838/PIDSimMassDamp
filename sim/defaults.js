// Default parameters for a simulation run.
// Units: degrees, seconds. Positive yaw = nose right (clockwise seen from above).

export const DEFAULTS = Object.freeze({
  // PID gains (output: tail pitch in degrees per degree of heading error)
  kp: 2, ki: 3, kd: 0.2,

  // Scenario
  step: 45,          // heading setpoint step at t = 0 (deg)
  duration: 4,       // visible simulation time after the step (s)
  preroll: 2,        // settle time before the step, setpoint 0 (s)
  showPreroll: 0.5,  // how much of the pre-roll to record for plotting (s)

  // Tail servo / actuator
  thetaMax: 25,      // tail pitch limit (deg)
  servoTau: 0.020,   // first-order lag (s)
  servoRate: 1000,   // slew limit (deg/s)

  // Yaw dynamics: dr/dt = A*theta - D_main - b*r
  A: 64,             // yaw accel per degree of tail pitch (deg/s^2 per deg)
  b: 2,              // aerodynamic yaw damping (1/s)
  Dmain: 320,        // main rotor torque (deg/s^2)
  mainTorque: true,  // set false to remove main rotor torque entirely

  // Collective punch disturbance
  punch: false,
  punchTime: 2,      // seconds after the step
  punchTorque: 192,  // extra main-rotor torque (deg/s^2), ~3 deg of tail pitch

  // Controller details
  loopRate: 1000,    // controller rate (Hz)
  dCutoff: 40,       // D-term low-pass cutoff (Hz)
  dOnError: false,   // false = derivative on measurement (no kick)
  antiWindup: true,  // conditional integration while saturated

  // Sensor
  noise: 0,          // gyro noise: Gaussian std-dev on measured heading (deg)
  seed: 12345,       // RNG seed so the noise pattern is repeatable

  // Integration
  dt: 0.0005,        // physics step (s)
  recordDt: 0.001,   // plot sample interval (s)
});
