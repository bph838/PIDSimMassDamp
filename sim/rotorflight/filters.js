/*
 * Filter and math primitives used by the Rotorflight yaw controller.
 *
 * JavaScript port of parts of Rotorflight (https://github.com/rotorflight/rotorflight-firmware):
 *   src/main/common/filter.c   pt1FilterGain/Apply, firstOrderLPF*, difFilter*, limitCutoff
 *   src/main/common/maths.h    limitf, transition
 *
 * Rotorflight is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version. This port is distributed under the same licence (see LICENSE).
 *
 * Differences from the C code: tan_approx() is replaced by Math.tan (exact),
 * and filters are closures instead of structs.
 */

// 95% of Nyquist
const limitCutoff = (cutoff, sampleRate) => Math.min(cutoff, 0.475 * sampleRate);

export const limitf = (value, limit) => (value < -limit ? -limit : value > limit ? limit : value);

export const constrain = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Linear map of src from [srcMin, srcMax] to [dstMin, dstMax], clamped at the ends. */
export function transition(src, srcMin, srcMax, dstMin, dstMax) {
  if (src > srcMax) return dstMax;
  if (src < srcMin) return dstMin;
  return dstMin + ((src - srcMin) * (dstMax - dstMin)) / (srcMax - srcMin);
}

export function pt1FilterGain(cutoff, sampleRate) {
  if (cutoff > 0 && sampleRate > 0) {
    cutoff = limitCutoff(cutoff, sampleRate);
    const gamma = sampleRate / (2 * Math.PI);
    return Math.min(cutoff / (cutoff + gamma), 1);
  }
  return 1;
}

/** PT1 low-pass: y += (x - y) * gain */
export function pt1Filter(cutoff, sampleRate) {
  const gain = pt1FilterGain(cutoff, sampleRate);
  let y1 = 0;
  return {
    apply(x) { y1 += (x - y1) * gain; return y1; },
    reset(v = 0) { y1 = v; },
  };
}

/** First-order low-pass, bilinear transform with pre-warping (LPF_1ST_ORDER). */
export function firstOrderLPF(cutoff, sampleRate) {
  let b0 = 1, b1 = 0, a1 = 0;
  if (cutoff > 0 && sampleRate > 0) {
    cutoff = limitCutoff(cutoff, sampleRate);
    const W = Math.tan((Math.PI * cutoff) / sampleRate);
    a1 = (W - 1) / (W + 1);
    b0 = W / (W + 1);
    b1 = b0;
  }
  let x1 = 0, y1 = 0;
  return {
    apply(x) { const y = b0 * x + b1 * x1 - a1 * y1; x1 = x; y1 = y; return y; },
    /** Start in steady state at value v (avoids a start-up transient). */
    reset(v = 0) { x1 = v; y1 = v; },
  };
}

/**
 * Band-limited differentiator: d/dt followed by a first-order low-pass,
 * discretised with the bilinear transform. Output units are input units per second.
 */
export function difFilter(cutoff, sampleRate) {
  let a = 0, b = 0;
  if (cutoff > 0 && sampleRate > 0) {
    cutoff = limitCutoff(cutoff, sampleRate / 2);
    const W = Math.tan((Math.PI * cutoff) / sampleRate);
    a = (W - 1) / (W + 1);
    b = (2 * sampleRate * W) / (W + 1);
  }
  let x1 = 0, y1 = 0;
  return {
    apply(x) { const y = b * (x - x1) - a * y1; x1 = x; y1 = y; return y; },
    /** Start in steady state with constant input v (derivative 0). */
    reset(v = 0) { x1 = v; y1 = 0; },
  };
}
