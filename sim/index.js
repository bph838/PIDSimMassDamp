// Public API of the simulation package. No DOM access: works in the browser and in Node.

export { DEFAULTS } from './defaults.js';
export { PRESETS } from './presets.js';
export { simulate, sampleIndex } from './simulate.js';
export { computeMetrics, computeStopMetrics, settleBand, SETTLE_BAND } from './metrics.js';
export { SCENARIOS, stickProfile, collectiveProfile } from './scenario.js';
export { createHeli, trimPitch } from './heli.js';
export { createRotorflightYawPid, RF_YAW_DEFAULTS, TAIL_DEG_PER_UNIT, COLLECTIVE_DEG_PER_UNIT } from './rotorflight/yawPid.js';
