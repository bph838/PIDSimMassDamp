// Small numeric helpers shared by the simulation modules.

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
