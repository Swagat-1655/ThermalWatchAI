// ============================================================
// ThermalWatch AI — Chart helpers (Chart.js)
// ============================================================
const ChartInstances = {};

function chartInit(id, config) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (ChartInstances[id]) { ChartInstances[id].destroy(); }
  ChartInstances[id] = new Chart(el.getContext('2d'), config);
  return ChartInstances[id];
}

function chartTheme() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    grid: dark ? 'rgba(148, 163, 184, 0.10)' : 'rgba(15, 23, 42, 0.08)',
    tick: dark ? '#8ba0bd' : '#5c6d88',
    text: dark ? '#c3d0e4' : '#2b3d5c',
  };
}

function baseScales(extra = {}) {
  const t = chartTheme();
  return {
    x: {
      grid: { color: t.grid }, ticks: { color: t.tick, font: { size: 10 } },
    },
    y: {
      grid: { color: t.grid }, ticks: { color: t.tick, font: { size: 10 } },
      beginAtZero: true,
    },
    ...extra,
  };
}

function lineChart(id, labels, datasets, opts = {}) {
  return chartInit(id, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: chartTheme().text, boxWidth: 10, font: { size: 10 } } },
        tooltip: { backgroundColor: 'rgba(8, 18, 38, 0.92)', borderColor: 'rgba(96,165,250,0.3)', borderWidth: 1, titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } },
      },
      scales: baseScales(),
      elements: { point: { radius: 2.5, hoverRadius: 5 }, line: { tension: 0.38 } },
      ...opts,
    },
  });
}

function barChart(id, labels, datasets, opts = {}) {
  return chartInit(id, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: !!opts.legend, labels: { color: chartTheme().text, boxWidth: 10, font: { size: 10 } } },
        tooltip: { backgroundColor: 'rgba(8, 18, 38, 0.92)', borderColor: 'rgba(96,165,250,0.3)', borderWidth: 1 },
      },
      scales: baseScales(),
      ...opts,
    },
  });
}

function doughnutChart(id, labels, values, colors, opts = {}) {
  return chartInit(id, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'right', labels: { color: chartTheme().text, boxWidth: 10, font: { size: 10 }, padding: 12 } },
        tooltip: { backgroundColor: 'rgba(8, 18, 38, 0.92)', borderColor: 'rgba(96,165,250,0.3)', borderWidth: 1 },
      },
      ...opts,
    },
  });
}

function radarChart(id, labels, datasets, opts = {}) {
  const t = chartTheme();
  return chartInit(id, {
    type: 'radar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 1,
          grid: { color: t.grid }, angleLines: { color: t.grid },
          pointLabels: { color: t.tick, font: { size: 9 } },
          ticks: { display: false, stepSize: 0.25 },
        },
      },
      plugins: {
        legend: { labels: { color: t.text, boxWidth: 10, font: { size: 10 } } },
      },
      ...opts,
    },
  });
}

function gaugeChart(id, value, color = '#22d3ee', label = '') {
  const el = document.getElementById(id);
  if (!el) return null;
  if (ChartInstances[id]) ChartInstances[id].destroy();
  const v = Math.max(0, Math.min(100, value));
  ChartInstances[id] = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [v, 100 - v],
        backgroundColor: [color, 'rgba(148,163,184,0.14)'],
        borderWidth: 0,
        circumference: 180,
        rotation: -90,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { animateRotate: true, duration: 900 },
    },
  });
  return ChartInstances[id];
}

function sparkline(canvas, values, color = '#22d3ee') {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 90, h = canvas.clientHeight || 30;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (!values.length) return;
  const min = Math.min(...values), max = Math.max(...values);
  const span = (max - min) || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (w - 4) + 2,
    h - 3 - ((v - min) / span) * (h - 6),
  ]);
  ctx.beginPath();
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  ctx.stroke();
  // soft fill
  ctx.lineTo(pts[pts.length - 1][0], h); ctx.lineTo(pts[0][0], h); ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, color + '44'); g.addColorStop(1, color + '00');
  ctx.fillStyle = g; ctx.fill();
}

function destroyAllCharts() {
  Object.values(ChartInstances).forEach(c => { try { c.destroy(); } catch (e) {} });
  Object.keys(ChartInstances).forEach(k => delete ChartInstances[k]);
}