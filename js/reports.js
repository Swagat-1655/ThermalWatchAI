// ============================================================
// ThermalWatch AI — Incident Report Generator (PDF / DOCX)
// ============================================================
const Reports = (() => {
  let currentId = null;

  const CDN = {
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    docx: 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js',
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.__twScripts && window.__twScripts[src]) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { window.__twScripts = window.__twScripts || {}; window.__twScripts[src] = true; resolve(); };
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  function sectionsFor(h) {
    const cat = CAT[h.category];
    const sev = SEV[h.severity];
    return {
      title: document.getElementById('rpTitle')?.value || 'ThermalWatch AI — Incident Intelligence Report',
      loc: [
        ['Hotspot ID', h.id], ['Classification', T(cat.label)],
        ['Latitude', h.lat.toFixed(4) + '°'], ['Longitude', h.lon.toFixed(4) + '°'],
        ['Nearest Industry', h.name], ['District / State', `${h.district} / ${h.state}`],
        ['Detected', `${h.acq_date} ${h.acq_time} IST`], ['Satellite / Instrument', `${h.satellite} / ${h.instrument}`],
        ['Confidence', h.confidence + '%'], ['FRP', h.frp + ' MW'], ['Brightness', h.brightness + ' K'],
      ],
      classification: {
        label: T(cat.label),
        conf: h.confidence,
        reasoning: h.category === 'industrial' ? [
          `Located inside ${h.name} boundary`,
          `Thermal intensity ${Math.round(h.temperature - 310)}°C above baseline`,
          'Sudden heat spike detected over last 72 hours',
          'Smoke signature detected (Sentinel-2 SWIR)',
        ] : [
          `Matched against ${h.fingerprint.ideal} fingerprint`,
          `Persistence: ${h.ageDays} days (${h.pattern} pattern)`,
          `FRP ${h.frp} MW within expected band`,
        ],
      },
      risk: {
        sev: sev.label, score: h.riskScore,
        pred: h.predList || [['6h', h.pred.h6], ['12h', h.pred.h12], ['24h', h.pred.h24], ['48h', h.pred.h48]],
      },
      hist: {
        age: h.ageDays, pattern: h.pattern,
        summary: `${T('tl_dur1')} ${h.ageDays} ${T('tl_dur2')} ${T('pat_' + h.pattern)} ${T('tl_dur3')} ${T('tl_likely')} ${h.sourceLabel}: ${h.likelyPct}%.`,
        latest: h.history.slice(-3).map(p => `${p.d}: ${p.t} K / ${p.f} MW`),
      },
      rec: h.recommendations,
    };
  }

  function checked(sec) {
    const el = document.querySelector(`.rp-checks input[data-sec="${sec}"]`);
    return !el || el.checked;
  }

  // ---------------- PDF ----------------
  function generatePdf(h) {
    const s = sectionsFor(h);
    const status = document.getElementById('rpStatus');
    const setStatus = (t, cls) => { if (status) { status.textContent = t; status.className = 'rp-status ' + (cls || ''); } };
    setStatus(T('loading') + ' jsPDF…');
    loadScript(CDN.jspdf).then(() => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210, M = 15;
      let y = 0;

      // Header band
      doc.setFillColor(8, 16, 36); doc.rect(0, 0, W, 34, 'F');
      doc.setFillColor(34, 211, 238); doc.rect(0, 34, W, 1.2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
      doc.text('ThermalWatch AI', M, 13);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(147, 197, 253);
      doc.text('AI Incident Intelligence Report', M, 20);
      doc.setTextColor(255, 255, 255); doc.setFontSize(12);
      doc.text(doc.splitTextToSize(s.title, W - 2 * M), M, 28);

      y = 44;
      const section = (title) => {
        doc.setFillColor(34, 211, 238); doc.circle(M + 1.2, y + 2.6, 1.2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(8, 20, 40);
        doc.text(title, M + 5, y + 4);
        y += 9;
        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.25);
        doc.line(M, y, W - M, y);
        y += 5;
      };
      const row = (k, v) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 100, 120);
        doc.text(k, M + 2, y + 4);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
        doc.text(doc.splitTextToSize(String(v), W - 2 * M - 70), M + 72, y + 4);
        y += 6;
        if (y > 282) { doc.addPage(); y = 20; }
      };
      const bullet = (t) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 50, 70);
        const lines = doc.splitTextToSize(t, W - 2 * M - 10);
        doc.setFillColor(34, 211, 238); doc.circle(M + 2.5, y + 1.6, 0.9, 'F');
        doc.text(lines, M + 6, y + 3.4);
        y += lines.length * 4.6 + 1.5;
        if (y > 285) { doc.addPage(); y = 20; }
      };

      if (checked('loc')) {
        section(T('rp_sec_loc'));
        s.loc.forEach(([k, v]) => row(k, v));
      }
      if (checked('class')) {
        section(T('rp_sec_class'));
        row(T('ai_class'), s.classification.label);
        row(T('ai_conf'), s.classification.conf + '%');
        s.classification.reasoning.forEach(r => bullet('✓ ' + r));
      }
      if (checked('risk')) {
        section(T('rp_sec_risk'));
        row(T('d_severity'), T(s.risk.sev));
        row(T('rs_score'), s.risk.score + ' / 100');
        s.risk.pred.forEach(([k, v]) => row(T('pred_' + k), v + '%'));
      }
      if (checked('hist')) {
        section(T('rp_sec_hist'));
        row(T('tl_duration'), s.hist.age + ' days');
        row(T('tl_pattern'), T('pat_' + s.hist.pattern));
        bullet('🤖 ' + s.hist.summary);
      }
      if (checked('rec')) {
        section(T('rp_sec_rec'));
        s.rec.forEach(r => bullet('→ ' + r));
      }

      // Footer
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
        doc.text('Generated by ThermalWatch AI • ' + new Date().toLocaleString('en-IN'), M, 290);
        doc.text('Page ' + i + ' / ' + pages, W - M - 18, 290);
      }
      doc.save(`ThermalWatch_${h.id}_${h.state.replace(/\s+/g, '')}.pdf`);
      setStatus('✓ ' + T('report_ok') + ' — PDF (' + h.id + ')', 'ok');
    }).catch(() => setStatus('✗ jsPDF failed to load — check internet connection'));
  }

  // ---------------- DOCX ----------------
  function generateDocx(h) {
    const s = sectionsFor(h);
    const status = document.getElementById('rpStatus');
    const setStatus = (t, cls) => { if (status) { status.textContent = t; status.className = 'rp-status ' + (cls || ''); } };
    setStatus(T('loading') + ' docx…');
    loadScript(CDN.docx).then(() => {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
      const children = [];
      const title = new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: '🔥 ThermalWatch AI', bold: true, color: '0891B2' })] });
      children.push(title);
      children.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph({ children: [new TextRun({ text: 'Generated: ' + new Date().toLocaleString('en-IN'), size: 18, color: '64748B' })] }));
      const addSec = (name, rows) => {
        children.push(new Paragraph({ text: name, heading: HeadingLevel.HEADING_2 }));
        rows.forEach(([k, v]) => {
          children.push(new Paragraph({ spacing: { after: 60 }, children: [
            new TextRun({ text: k + ': ', bold: true, size: 20 }),
            new TextRun({ text: String(v), size: 20 }),
          ] }));
        });
      };
      const addBullets = (items) => items.forEach(t => children.push(new Paragraph({ text: '• ' + t, bullet: { level: 0 }, spacing: { after: 40 } })));
      if (checked('loc')) addSec(T('rp_sec_loc'), s.loc);
      if (checked('class')) {
        addSec(T('rp_sec_class'), [[T('ai_class'), s.classification.label], [T('ai_conf'), s.classification.conf + '%']]);
        addBullets(s.classification.reasoning);
      }
      if (checked('risk')) {
        addSec(T('rp_sec_risk'), [[T('d_severity'), T(s.risk.sev)], [T('rs_score'), s.risk.score + ' / 100']]);
        addBullets(s.risk.pred.map(([k, v]) => `${T('pred_' + k)} (${k}): ${v}%`));
      }
      if (checked('hist')) {
        addSec(T('rp_sec_hist'), [[T('tl_duration'), s.hist.age + ' days'], [T('tl_pattern'), T('pat_' + s.hist.pattern)]]);
        addBullets([s.hist.summary, ...s.hist.latest]);
      }
      if (checked('rec')) {
        addSec(T('rp_sec_rec'), []);
        addBullets(s.rec);
      }
      const doc = new Document({ sections: [{ properties: {}, children }] });
      Packer.toBlob(doc).then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ThermalWatch_${h.id}_${h.state.replace(/\s+/g, '')}.docx`;
        a.click();
        URL.revokeObjectURL(a.href);
        setStatus('✓ ' + T('report_ok') + ' — DOCX (' + h.id + ')', 'ok');
      });
    }).catch(() => {
      // Fallback: Word-compatible HTML .doc
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${h.id} Report</title></head><body>
        <h1 style="color:#0891b2">🔥 ThermalWatch AI</h1><h2>${s.title}</h2>
        <p><em>Generated ${new Date().toLocaleString('en-IN')}</em></p>
        ${checked('loc') ? `<h3>${T('rp_sec_loc')}</h3><table border="1" cellpadding="4">${s.loc.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join('')}</table>` : ''}
        ${checked('class') ? `<h3>${T('rp_sec_class')}</h3><p><b>${T('ai_class')}:</b> ${s.classification.label} — ${s.classification.conf}%</p><ul>${s.classification.reasoning.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}
        ${checked('risk') ? `<h3>${T('rp_sec_risk')}</h3><p><b>${T('d_severity')}:</b> ${T(s.risk.sev)} • <b>${T('rs_score')}:</b> ${s.risk.score}/100</p><ul>${s.risk.pred.map(([k, v]) => `<li>${k}: ${v}%</li>`).join('')}</ul>` : ''}
        ${checked('hist') ? `<h3>${T('rp_sec_hist')}</h3><ul><li>${s.hist.summary}</li></ul>` : ''}
        ${checked('rec') ? `<h3>${T('rp_sec_rec')}</h3><ul>${s.rec.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}
      </body></html>`;
      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ThermalWatch_${h.id}_${h.state.replace(/\s+/g, '')}.doc`;
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus('✓ ' + T('report_ok') + ' — DOC (fallback, ' + h.id + ')', 'ok');
    });
  }

  function generate(h, kind) {
    if (kind === 'pdf') generatePdf(h);
    else generateDocx(h);
  }

  // ---------------- Live preview ----------------
  function renderPreview() {
    const h = hotspotById(currentId);
    const box = document.getElementById('rpPreview');
    if (!h) { box.innerHTML = '<div class="muted">Select a hotspot…</div>'; return; }
    const s = sectionsFor(h);
    const parts = [];
    parts.push(`<h3>${s.title}</h3><div class="muted">Generated ${new Date().toLocaleString('en-IN')} • Team NEON NEXUS</div>`);
    if (checked('loc')) {
      parts.push(`<h4>1. ${T('rp_sec_loc')}</h4><div class="rp-meta">${s.loc.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`);
    }
    if (checked('class')) {
      parts.push(`<h4>2. ${T('rp_sec_class')}</h4><div class="rp-meta"><div><span>${T('ai_class')}</span><b>${s.classification.label}</b></div><div><span>${T('ai_conf')}</span><b>${s.classification.conf}%</b></div></div><ul>${s.classification.reasoning.map(r => `<li>${r}</li>`).join('')}</ul>`);
    }
    if (checked('risk')) {
      parts.push(`<h4>3. ${T('rp_sec_risk')}</h4><div class="rp-meta"><div><span>${T('d_severity')}</span><b>${T(s.risk.sev)}</b></div><div><span>${T('rs_score')}</span><b>${s.risk.score}/100</b></div>${s.risk.pred.map(([k, v]) => `<div><span>${k}</span><b>${v}%</b></div>`).join('')}</div>`);
    }
    if (checked('hist')) {
      parts.push(`<h4>4. ${T('rp_sec_hist')}</h4><ul><li>${s.hist.summary}</li></ul>`);
    }
    if (checked('rec')) {
      parts.push(`<h4>5. ${T('rp_sec_rec')}</h4><ul>${s.rec.map(r => `<li>${r}</li>`).join('')}</ul>`);
    }
    box.innerHTML = parts.join('');
  }

  function init() {
    const sel = document.getElementById('rpHotspot');
    sel.innerHTML = DATA.hotspots.map(h => `<option value="${h.id}">${h.id} — ${h.name} (${h.state})</option>`).join('');
    sel.onchange = () => { currentId = sel.value; renderPreview(); };
    document.querySelectorAll('.rp-checks input').forEach(c => c.onchange = () => renderPreview());
    document.getElementById('rpTitle').addEventListener('input', () => renderPreview());
    document.getElementById('rpPdf').onclick = () => { const h = hotspotById(currentId || sel.value); if (h) generate(h, 'pdf'); };
    document.getElementById('rpDocx').onclick = () => { const h = hotspotById(currentId || sel.value); if (h) generate(h, 'docx'); };
    if (sel.value) { currentId = sel.value; renderPreview(); }
  }

  function setHotspot(id) {
    const sel = document.getElementById('rpHotspot');
    if (!sel) return;
    sel.value = id;
    currentId = id;
    renderPreview();
  }

  return { init, generate, renderPreview, setHotspot };
})();