// Public API of the simulation package. No DOM access: works in the browser and in Node.

export { DEFAULTS } from './defaults.js';
export { PRESETS } from './presets.js';
export { simulate, sampleIndex } from './simulate.js';
export { computeMetrics, computeStopMetrics, settleBand, SETTLE_BAND } from './metrics.js';
export { SCENARIOS, stickProfile, collectiveProfile } from './scenario.js';
export { createHeli, trimPitch } from './heli.js';
export { createRotorflightYawPid, RF_YAW_DEFAULTS, RF_YAW_LIMITS, TAIL_DEG_PER_UNIT, COLLECTIVE_DEG_PER_UNIT } from './rotorflight/yawPid.js';
export { RATES_TYPES, YAW_RATES_DEFAULTS, yawRateForStick, maxYawRate, stickForYawRate } from './rotorflight/rates.js';
export { parseRotorflightCli, profileChoices, yawConfigFromCli } from './rotorflight/cli.js';
export { TUNE_KEYS, TUNE_RANGES, TUNE_EFFORT, createScorer, searchGains } from './tune.js';
export { stepResponse, STEP_WINDOW, STEP_PRE, STEP_BAND } from './stepResponse.js';
