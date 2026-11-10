// The three time-series charts (heading, tail pitch, P/I/D), their playhead and hover tooltips.
// Uses the global `Chart` from the Chart.js UMD build loaded in index.html.

import { SETTLE_BAND } from '../sim/index.js';
import { state, SHOW_PRE } from './state.js';
import { T, PIN_SLOTS, withAlpha } from './theme.js';
import { $, clamp, signed } from './util.js';

const Chart = window.Chart;
const charts = {};   // key -> Chart instance
const overlays = {}; // key -> { ph: playhead div, tip: tooltip div }

// Dataset indices in the heading chart
const H_HEADING = 0, H_SETPOINT = 1, H_PIN0 = 2, H_BAND_LO = 6, H_BAND_HI = 7;

// Dashed vertical marker at the collective punch, drawn on every chart.
const markerPlugin = {
  id: 'markers',
  afterDatasetsDraw(chart) {
    if (!state.punch) return;
    const { ctx, chartArea: a, scales: { x } } = chart;
    const px = x.getPixelForValue(state.punchTime);
    if (px < a.left || px > a.right) return;
    ctx.save();
    ctx.strokeStyle = T.muted;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
    if (chart === charts.heading) {
      ctx.fillStyle = T['ink-2'];
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText('collective punch', px + 4, a.bottom - 6);
    }
    ctx.restore();
  },
};

function lineDs(label, color, extra = {}) {
  return {
    label, data: [], borderColor: color, backgroundColor: color,
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, fill: false, tension: 0,
    ...extra,
  };
}

function baseOptions(yTitle, showXTitle) {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    parsing: false, normalized: true,
    events: ['click'], // legend clicks only; hover is handled in attachPointer()
    layout: { padding: { right: 6 } },
    plugins: {
      decimation: { enabled: true, algorithm: 'min-max' },
      tooltip: { enabled: false },
      legend: {
        position: 'top', align: 'end',
        labels: {
          boxWidth: 16, boxHeight: 3, color: T['ink-2'], font: { size: 12 },
          filter: (item, data) => {
            const ds = data.datasets[item.datasetIndex];
            return !ds.noLegend && ds.data.length > 0;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear', min: -SHOW_PRE, max: state.duration,
        grid: { color: T.grid }, border: { color: T.axis },
        ticks: { color: T.muted, maxRotation: 0 },
        title: { display: showXTitle, text: 'Time after step (s)', color: T.muted },
      },
      y: {
        grid: { color: T.grid }, border: { color: T.axis },
        ticks: { color: T.muted, includeBounds: false },
        title: { display: true, text: yTitle, color: T.muted },
        afterFit: (scale) => { scale.width = 58; }, // same plot-area width so time lines up across charts
      },
    },
  };
}

/**
 * (Re)create the charts. Call again after a theme change.
 * @param handlers { onHover(t, key), onLeave(), onClick(t, key) }
 */
export function createCharts(handlers) {
  for (const k in charts) charts[k].destroy();
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  charts.heading = new Chart($('c-heading'), {
    type: 'line',
    data: {
      datasets: [
        lineDs('Heading', T.s1, { order: 0 }),
        lineDs('Setpoint', T['ink-2'], { order: 1, borderWidth: 1.5, borderDash: [6, 4] }),
        ...PIN_SLOTS.map((s, j) => lineDs('', withAlpha(T[s], 0.6), { order: 2 + j, borderWidth: 1.5 })),
        lineDs('', 'transparent', { order: 10, borderWidth: 0, noLegend: true }),
        lineDs('±2% band', T.band, { order: 11, borderWidth: 0, fill: '-1' }),
      ],
    },
    options: baseOptions('Heading (°)', false),
    plugins: [markerPlugin],
  });

  charts.pitch = new Chart($('c-pitch'), {
    type: 'line',
    data: {
      datasets: [
        lineDs('Command', T.s1, { order: 0 }),
        lineDs('Actual (servo)', T.s2, { order: 1, borderWidth: 1.5 }),
        lineDs('±θmax', T.serious, { order: 2, borderWidth: 1.5, borderDash: [5, 4] }),
        lineDs('', T.serious, { order: 3, borderWidth: 1.5, borderDash: [5, 4], noLegend: true }),
        lineDs('Hover trim', T.muted, { order: 4, borderWidth: 1, borderDash: [2, 3] }),
      ],
    },
    options: baseOptions('Pitch (°)', false),
    plugins: [markerPlugin],
  });

  charts.pid = new Chart($('c-pid'), {
    type: 'line',
    data: {
      datasets: [
        lineDs('P', T.s1, { order: 0 }),
        lineDs('I', T.s2, { order: 1 }),
        lineDs('D', T.s3, { order: 2, borderWidth: 1.5 }),
      ],
    },
    options: baseOptions('Pitch (°)', true),
    plugins: [markerPlugin],
  });

  for (const k in charts) attachPointer(k, handlers);
}

function attachPointer(key, { onHover, onLeave, onClick }) {
  const canvas = charts[key].canvas;
  const wrap = canvas.parentElement;
  overlays[key] = { ph: wrap.querySelector('.playhead'), tip: wrap.querySelector('.tip') };
  const tAt = (clientX) => {
    const r = canvas.getBoundingClientRect();
    return clamp(charts[key].scales.x.getValueForPixel(clientX - r.left), -SHOW_PRE, state.duration);
  };
  canvas.onmousemove = (e) => onHover(tAt(e.clientX), key);
  canvas.onmouseleave = () => onLeave();
  canvas.onclick = (e) => onClick(tAt(e.clientX), key);
  canvas.ontouchmove = (e) => { if (e.touches[0]) onHover(tAt(e.touches[0].clientX), key); };
}

const xy = (t, arr) => {
  const out = new Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = { x: t[i], y: arr[i] };
  return out;
};
const hline = (y, x0, x1) => [{ x: x0, y }, { x: x1, y }];

/** Redraw all charts from a simulate() result. `pins` is the 4-slot array of pinned runs. */
export function updateCharts(res, pins) {
  const { t } = res;
  const S = state.step, band = SETTLE_BAND * S, tm = state.thetaMax, x0 = -SHOW_PRE, x1 = state.duration;

  const h = charts.heading.data.datasets;
  h[H_HEADING].data = xy(t, res.psi);
  h[H_SETPOINT].data = [{ x: x0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: S }, { x: x1, y: S }];
  pins.forEach((p, j) => {
    h[H_PIN0 + j].data = p ? p.data : [];
    h[H_PIN0 + j].label = p ? p.label : '';
  });
  h[H_BAND_LO].data = hline(S - band, 0, x1);
  h[H_BAND_HI].data = hline(S + band, 0, x1);

  const pd = charts.pitch.data.datasets;
  pd[0].data = xy(t, res.cmd);
  pd[1].data = xy(t, res.theta);
  pd[2].data = hline(tm, x0, x1);
  pd[3].data = hline(-tm, x0, x1);
  pd[4].data = res.trim > 0 ? hline(res.trim, x0, x1) : [];
  pd[4].label = `Hover trim (${res.trim.toFixed(1)}°)`;
  charts.pitch.options.scales.y.min = -tm * 1.15;
  charts.pitch.options.scales.y.max = tm * 1.15;

  const q = charts.pid.data.datasets;
  q[0].data = xy(t, res.p);
  q[1].data = xy(t, res.i);
  q[2].data = xy(t, res.d);
  // Keep the scale readable: a derivative kick can be thousands of degrees.
  let lo = 0, hi = 0;
  for (const a of [res.p, res.i, res.d]) for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  const lim = 4 * tm;
  const clipped = hi > lim || lo < -lim;
  charts.pid.options.scales.y.min = Math.max(-lim, Math.min(-1, lo * 1.08));
  charts.pid.options.scales.y.max = Math.min(lim, Math.max(1, hi * 1.08));
  $('pidNote').textContent = 'degrees of tail pitch' +
    (clipped ? ` · clipped at ±${lim.toFixed(0)}° (peak ${Math.max(hi, -lo).toFixed(0)}°)` : '');

  for (const k in charts) {
    charts[k].options.scales.x.max = x1;
    charts[k].update('none');
  }
}

/** Current heading trace as {x,y} points (copy), for pinning. */
export function headingSnapshot() {
  return charts.heading.data.datasets[H_HEADING].data.map((p) => ({ x: p.x, y: p.y }));
}

function tipRows(key, res, i) {
  const row = (color, name, v, unit = '°') =>
    `<div class="row"><span class="sw" style="background:${color}"></span>${name}<b>${signed(v)}${unit}</b></div>`;
  if (key === 'heading') {
    return row(T.s1, 'Heading', res.psi[i]) + row(T['ink-2'], 'Setpoint', res.sp[i]) + row(T.muted, 'Yaw rate', res.rate[i], '°/s');
  }
  if (key === 'pitch') return row(T.s1, 'Command', res.cmd[i]) + row(T.s2, 'Actual', res.theta[i]);
  return row(T.s1, 'P', res.p[i]) + row(T.s2, 'I', res.i[i]) + row(T.s3, 'D', res.d[i]);
}

/** Move the playhead on every chart to time t (sample i); show a tooltip on `hoverKey`'s chart. */
export function showPlayhead(res, t, i, hoverKey) {
  for (const k in charts) {
    const ch = charts[k], a = ch.chartArea, o = overlays[k];
    if (!a) continue;
    const px = ch.scales.x.getPixelForValue(t);
    Object.assign(o.ph.style, { display: 'block', left: px + 'px', top: a.top + 'px', height: (a.bottom - a.top) + 'px' });
    if (k === hoverKey) {
      o.tip.innerHTML = `<div class="t">t = ${res.t[i].toFixed(3)} s</div>` + tipRows(k, res, i);
      o.tip.style.display = 'block';
      const tw = o.tip.offsetWidth;
      o.tip.style.left = (px + 12 + tw > a.right ? px - 12 - tw : px + 12) + 'px';
    } else {
      o.tip.style.display = 'none';
    }
  }
}
