// Top-down helicopter view: compass ring, target line, fuselage, rotors and tail thrust arrow.

import { T, withAlpha } from './theme.js';
import { clamp, signed } from './util.js';

const rad = (d) => (d * Math.PI) / 180;

function arrow(ctx, x0, y0, x1, y1, head) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang - 0.45), y1 - head * Math.sin(ang - 0.45));
  ctx.lineTo(x1 - head * Math.cos(ang + 0.45), y1 - head * Math.sin(ang + 0.45));
  ctx.closePath(); ctx.fill();
}

/**
 * @param canvas    the <canvas> element (sized by CSS; backing store follows it)
 * @param onResize  called after the canvas is resized, so the caller can redraw
 * @returns { draw(frame, opts) } where frame = { psi, sp, theta } in degrees
 *          and opts = { rotorAngle (rad), spinning (bool) }
 */
export function createHeliView(canvas, onResize) {
  const ctx = canvas.getContext('2d');

  new ResizeObserver(() => {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    onResize();
  }).observe(canvas);

  function draw({ psi, sp, theta }, { rotorAngle = 0.4, spinning = false } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr, H = canvas.height / dpr;
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) / 2 - 18;
    // heading 0° = up, positive = clockwise (nose right)
    const pt = (deg, r) => [cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))];

    drawCompass(pt, cx, cy, R);
    drawTarget(pt, cx, cy, R, psi, sp);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad(psi));
    drawAirframe(R / 100, theta);
    drawMainRotor(R / 100, rotorAngle, spinning);
    ctx.restore();

    // Labels
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = T.ink;
    ctx.fillText(`Heading ${signed(psi)}°`, 8, 6);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = T['ink-2'];
    ctx.fillText(`Target ${signed(sp)}°`, 8, 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = T.s2;
    ctx.fillText(`Tail ${signed(theta)}°`, W - 8, 6);
  }

  function drawCompass(pt, cx, cy, R) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = T.axis;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = T.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 15) {
      const major = d % 90 === 0;
      const [x0, y0] = pt(d, R), [x1, y1] = pt(d, R - (major ? 9 : 5));
      ctx.strokeStyle = major ? T.muted : T.axis;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      if (major) { const [lx, ly] = pt(d, R + 10); ctx.fillText(d > 180 ? `${d - 360}°` : `${d}°`, lx, ly); }
    }
  }

  function drawTarget(pt, cx, cy, R, psi, sp) {
    // Error arc between heading and target
    const a0 = rad(psi) - Math.PI / 2, a1 = rad(sp) - Math.PI / 2;
    if (Math.abs(sp - psi) > 0.2) {
      ctx.strokeStyle = withAlpha(T.s1, 0.35);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, R - 16, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    }
    // Target heading line
    const [tx, ty] = pt(sp, R - 2);
    ctx.strokeStyle = T['ink-2'];
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = T['ink-2'];
    ctx.beginPath(); ctx.arc(tx, ty, 4, 0, 2 * Math.PI); ctx.fill();
  }

  // Body frame, nose = -y, units of u = R/100.
  function drawAirframe(u, theta) {
    // tail boom + stabiliser
    ctx.fillStyle = T.fuselage;
    ctx.strokeStyle = T['ink-2'];
    ctx.lineWidth = 1;
    ctx.fillRect(-2 * u, 12 * u, 4 * u, 52 * u);
    ctx.strokeRect(-2 * u, 12 * u, 4 * u, 52 * u);
    ctx.fillRect(-11 * u, 48 * u, 22 * u, 4 * u);
    ctx.strokeRect(-11 * u, 48 * u, 22 * u, 4 * u);

    // tail rotor (edge-on from above) on the right of the boom
    ctx.strokeStyle = T.ink;
    ctx.lineWidth = 2.5 * u;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(5 * u, 56 * u); ctx.lineTo(5 * u, 72 * u); ctx.stroke();
    ctx.lineCap = 'butt';

    // Tail thrust arrow: positive pitch pushes the tail left (body -x) → nose yaws right.
    const len = clamp(theta, -30, 30) * 2 * u;
    if (Math.abs(len) > 1) {
      ctx.strokeStyle = T.s2; ctx.fillStyle = T.s2; ctx.lineWidth = 2.5;
      const xStart = len > 0 ? -4 * u : 8 * u;
      arrow(ctx, xStart, 64 * u, xStart - len, 64 * u, 7);
    }

    // skids
    ctx.strokeStyle = T.muted;
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 15 * u, -16 * u); ctx.lineTo(s * 15 * u, 18 * u); ctx.stroke(); }

    // fuselage + canopy
    ctx.fillStyle = T.fuselage;
    ctx.strokeStyle = T['ink-2'];
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, 11 * u, 23 * u, 0, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = withAlpha(T.s1, 0.45);
    ctx.beginPath(); ctx.ellipse(0, -11 * u, 7.5 * u, 9 * u, 0, 0, 2 * Math.PI); ctx.fill();
  }

  // Main rotor disc + blades (spins clockwise seen from above).
  function drawMainRotor(u, rotorAngle, spinning) {
    ctx.fillStyle = withAlpha(T.ink, 0.05);
    ctx.strokeStyle = withAlpha(T.ink, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 50 * u, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.rotate(rotorAngle);
    if (spinning) { // motion-blur wedges
      ctx.fillStyle = withAlpha(T.ink, 0.08);
      for (const off of [0, Math.PI]) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 50 * u, off - 0.5, off); ctx.closePath(); ctx.fill();
      }
    }
    ctx.strokeStyle = T.ink;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 3 * u;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-50 * u, 0); ctx.lineTo(50 * u, 0); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    ctx.fillStyle = T.ink;
    ctx.beginPath(); ctx.arc(0, 0, 3.5 * u, 0, 2 * Math.PI); ctx.fill();
  }

  return { draw };
}
