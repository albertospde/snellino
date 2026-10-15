// Snellino — Modifica PDF: unisci più PDF, scegli/elimina/riordina/ruota/duplica le pagine,
// estrai, dividi, rinomina e salva (normale o compresso). Tutto nel browser.
// Anteprime con pdf.js, riscrittura del file con pdf-lib, compressione con il worker Ghostscript
// di index.html (preparaMotore / workers / OPZ / GUADAGNO_MIN), di cui riusa anche $, esc, toast, fmtMB, salvaBlob.
'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const COLORI_FONTE = ['#00b4e8', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#84cc16'];
const A4 = { w: 595.28, h: 841.89 };

// fonte: { nome, bytes, doc (pdf.js), lib (pdf-lib, a richiesta), n, colore, lettera }
// pagina: { id, f (indice fonte, null = pagina bianca), i (indice pagina nella fonte), rot, sel, w, h }
const ed = {
  fonti: [], pagine: [], storia: [], ancora: null, prossimoId: 1,
  thumbs: new Map(), urgenti: [], coda: [], inRender: false, trascinati: null, dest: null, antIdx: -1,
};

const edNomeFile = () => ($('edNome').value.trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'documento');
const edSelezionate = () => ed.pagine.filter((p) => p.sel);
const nuovaPagina = (x) => ({ id: ed.prossimoId++, rot: 0, sel: false, ...x });

// ── Apertura ──
async function edApri(files) {
  const pdf = [...files].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  if (!pdf.length) { toast('Nessun PDF da aprire', true); return; }
  mostraVista('modifica');
  const primaVolta = !ed.fonti.length;
  const nuove = [];
  for (const f of pdf) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;   // pdf.js si tiene la sua copia
      const k = ed.fonti.length;
      ed.fonti.push({ nome: f.name, bytes, doc, lib: null, n: doc.numPages, colore: COLORI_FONTE[k % COLORI_FONTE.length], lettera: String.fromCharCode(65 + (k % 26)) });
      for (let i = 0; i < doc.numPages; i++) nuove.push(nuovaPagina({ f: k, i }));
    } catch (e) {
      console.warn('[Snellino] apertura', f.name, e);
      toast(e && e.name === 'PasswordException' ? `${f.name}: PDF protetto da password, non modificabile` : `${f.name}: non è un PDF leggibile`, true);
    }
  }
  if (!nuove.length) return;
  if (!primaVolta) ed.storia.push(JSON.stringify(ed.pagine));
  ed.pagine.push(...nuove);
  if (primaVolta) $('edNome').value = pdf[0].name.replace(/\.pdf$/i, '');
  if (!primaVolta) toast(`Aggiunte ${nuove.length} pagine in fondo`);
  edDisegna();
}
function edApriDaElenco(i) { const v = voci[i]; if (v) edApri([v.file]); }

$('inEd').addEventListener('change', (e) => { edApri(e.target.files); e.target.value = ''; });
$('inEdAgg').addEventListener('change', (e) => { edApri(e.target.files); e.target.value = ''; });

function edChiudi() {
  if (ed.pagine.length && !confirm('Chiudere il documento? Le modifiche non salvate andranno perse.')) return;
  ed.fonti.forEach((f) => { try { f.doc.destroy(); } catch (e) {} });
  ed.thumbs.forEach((u) => URL.revokeObjectURL(u));
  Object.assign(ed, { fonti: [], pagine: [], storia: [], ancora: null, thumbs: new Map(), urgenti: [], coda: [] });
  $('edNome').value = '';
  edDisegna();
}

// ── Miniature (pdf.js, solo quelle visibili, una alla volta) ──
const osservatore = new IntersectionObserver((voci) => {
  for (const v of voci) if (v.isIntersecting) { osservatore.unobserve(v.target); richiediThumb(v.target.dataset.k, true); }
}, { rootMargin: '600px' });
// urgente = visibile a schermo: passa davanti alle altre, che si preparano comunque in sottofondo
function richiediThumb(k, urgente) {
  if (ed.thumbs.has(k) || ed.urgenti.includes(k)) return;
  if (urgente) ed.urgenti.push(k);
  else if (!ed.coda.includes(k)) ed.coda.push(k);
  if (!ed.inRender) giroThumb();
}
async function giroThumb() {
  ed.inRender = true;
  while (ed.urgenti.length || ed.coda.length) {
    const k = ed.urgenti.length ? ed.urgenti.shift() : ed.coda.shift();
    const [f, i] = k.split(':').map(Number);
    const fonte = ed.fonti[f];
    if (!fonte || ed.thumbs.has(k)) continue;
    try {
      const page = await fonte.doc.getPage(i + 1);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 300 / Math.max(vp1.width, vp1.height) });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      // intent "print": pdf.js non aspetta requestAnimationFrame, così le miniature si preparano anche a scheda nascosta
      await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      if (ed.fonti[f] !== fonte) continue;                              // documento chiuso nel frattempo
      const url = URL.createObjectURL(blob);
      ed.thumbs.set(k, url);
      document.querySelectorAll(`.pg-ph[data-k="${k}"]`).forEach((ph) => {
        const rot = ph.dataset.rot;
        ph.outerHTML = `<img src="${url}" class="r${rot}" alt="" draggable="false">`;
      });
    } catch (e) {
      console.warn('[Snellino] miniatura', k, e);
      document.querySelectorAll(`.pg-ph[data-k="${k}"]`).forEach((ph) => { ph.textContent = '⚠'; });
    }
  }
  ed.inRender = false;
}

// ── Disegno ──
// intestazione, contatori e pulsanti (senza ridisegnare le pagine)
function edStato() {
  const nSel = edSelezionate().length;
  const usate = new Set(ed.pagine.map((p) => p.f).filter((f) => f != null));
  $('edInfo').innerHTML = `<b>${ed.pagine.length} pagine</b>${nSel ? ` · <span style="color:var(--accent)">${nSel} selezionate</span>` : ''}`
    + ed.fonti.map((f, k) => `<span class="fonte" title="${esc(f.nome)} · ${f.n} pagine${usate.has(k) ? '' : ' (nessuna pagina usata)'}" style="${usate.has(k) ? '' : 'opacity:.45'}"><i style="background:${f.colore}"></i>${f.lettera} <b>${esc(f.nome)}</b></span>`).join('');
  $('edSaveInfo').textContent = ed.pagine.length
    ? `Il PDF salvato avrà ${ed.pagine.length} pagine${ed.fonti.length > 1 ? ` (da ${usate.size} PDF)` : ''}.`
    : 'Nessuna pagina: aggiungi un PDF o premi Annulla.';
  document.querySelectorAll('#edLavoro [data-sel]').forEach((b) => { b.disabled = !nSel; });
  // con pagine selezionate compare la barra azzurra delle azioni, altrimenti il suggerimento
  $('edBarraSel').style.display = nSel ? '' : 'none';
  $('edSuggerimento').style.display = nSel ? 'none' : '';
  $('edNSel').textContent = nSel === 1 ? '1 pagina selezionata' : `${nSel} pagine selezionate`;
  $('edUndo').disabled = !ed.storia.length;
  $('edSalvaNorm').disabled = $('edSalvaComp').disabled = !ed.pagine.length;
}
// solo la selezione è cambiata: aggiorna le classi, così clic e doppio clic restano sullo stesso elemento
function edSoloSelezione() {
  const sel = new Set(edSelezionate().map((p) => p.id));
  griglia.querySelectorAll('.pg').forEach((c) => c.classList.toggle('sel', sel.has(+c.dataset.id)));
  edStato();
}
function edDisegna() {
  const aperto = ed.fonti.length > 0;
  $('dropEd').style.display = aperto ? 'none' : '';
  $('edLavoro').style.display = aperto ? '' : 'none';
  if (!aperto) { $('edGrid').innerHTML = ''; return; }
  edStato();
  $('edGrid').innerHTML = ed.pagine.length ? ed.pagine.map((p, n) => {
    const fonte = p.f != null ? ed.fonti[p.f] : null;
    const k = fonte ? `${p.f}:${p.i}` : '';
    let thumb;
    if (!fonte) thumb = `<div class="pg-vuota r${p.rot}"></div>`;
    else if (ed.thumbs.has(k)) thumb = `<img src="${ed.thumbs.get(k)}" class="r${p.rot}" alt="" draggable="false">`;
    else thumb = `<div class="pg-ph pg-load" data-k="${k}" data-rot="${p.rot}"><span class="spin"></span></div>`;
    const src = fonte
      ? `<span class="pg-src" title="${esc(fonte.nome)} · pagina ${p.i + 1}"><i style="background:${fonte.colore}"></i>${fonte.lettera}${p.i + 1}</span>`
      : '<span class="pg-src" title="Pagina bianca aggiunta">bianca</span>';
    return `<div class="pg${p.sel ? ' sel' : ''}" draggable="true" data-id="${p.id}">
      <span class="pg-check">✓</span>
      <div class="pg-thumb">${thumb}</div>
      <div class="pg-foot"><span class="pg-n">${n + 1}</span>${src}
        <span class="pg-act"><button data-a="zoom" title="Vedi in grande">🔍</button><button data-a="sx" title="Gira a sinistra">↺</button><button data-a="dx" title="Gira a destra">↻</button><button data-a="del" title="Togli la pagina">🗑</button></span>
      </div></div>`;
  }).join('') : '<div class="vuoto" style="grid-column:1/-1">Nessuna pagina. Usa <b>↶ Annulla</b> o <b>➕ Aggiungi PDF</b>.</div>';
  document.querySelectorAll('#edGrid .pg-ph').forEach((el) => osservatore.observe(el));
  setTimeout(() => document.querySelectorAll('#edGrid .pg-ph').forEach((el) => richiediThumb(el.dataset.k)), 300);
}

// ogni modifica alle pagine passa di qui (per poterla annullare)
function edModifica(fn) {
  ed.storia.push(JSON.stringify(ed.pagine));
  if (ed.storia.length > 80) ed.storia.shift();
  fn();
  edDisegna();
}
function edAnnulla() {
  if (!ed.storia.length) return;
  ed.pagine = JSON.parse(ed.storia.pop());
  edDisegna();
}

// ── Selezione ──
function edSeleziona(modo) {
  ed.pagine.forEach((p, n) => {
    if (modo === 'tutte') p.sel = true;
    else if (modo === 'nessuna') p.sel = false;
    else if (modo === 'inverti') p.sel = !p.sel;
    else if (modo === 'dispari') p.sel = n % 2 === 0;
    else if (modo === 'pari') p.sel = n % 2 === 1;
  });
  edSoloSelezione();
}
// "1-3, 7, 10-" → posizioni attuali (1 = prima pagina)
function edSelezionaIntervallo() {
  const testo = $('edIntervallo').value.trim();
  const tot = ed.pagine.length, scelte = new Set();
  for (const parte of testo.split(/[,;\s]+/).filter(Boolean)) {
    const m = parte.match(/^(\d*)\s*-\s*(\d*)$/);
    let a, b;
    if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : tot; }
    else if (/^\d+$/.test(parte)) a = b = +parte;
    else { toast(`"${parte}" non è un numero di pagina`, true); return; }
    if (a > b) [a, b] = [b, a];
    for (let x = Math.max(1, a); x <= Math.min(tot, b); x++) scelte.add(x - 1);
  }
  if (!scelte.size) { toast('Nessuna pagina in quell\'intervallo', true); return; }
  ed.pagine.forEach((p, n) => { p.sel = scelte.has(n); });
  edSoloSelezione();
}

// ── Operazioni sulle pagine ──
function edRuota(gradi, soloId) {
  edModifica(() => {
    ed.pagine.forEach((p) => { if (soloId ? p.id === soloId : p.sel) p.rot = (p.rot + gradi + 360) % 360; });
  });
}
function edElimina(soloId) {
  const via = soloId ? [soloId] : edSelezionate().map((p) => p.id);
  if (!via.length) return;
  if (via.length === ed.pagine.length && !confirm('Eliminare tutte le pagine?')) return;
  edModifica(() => { ed.pagine = ed.pagine.filter((p) => !via.includes(p.id)); });
}
function edTieniSolo() {
  edModifica(() => { ed.pagine = edSelezionate(); ed.pagine.forEach((p) => { p.sel = false; }); });
}
function edDuplica() {
  edModifica(() => {
    const out = [];
    ed.pagine.forEach((p) => { out.push(p); if (p.sel) out.push(nuovaPagina({ f: p.f, i: p.i, rot: p.rot, w: p.w, h: p.h })); });
    ed.pagine = out;
  });
}
function edSposta(dove) {
  edModifica(() => {
    const sel = edSelezionate(), resto = ed.pagine.filter((p) => !p.sel);
    ed.pagine = dove === 'inizio' ? [...sel, ...resto] : [...resto, ...sel];
  });
}
function edInvertiOrdine() { edModifica(() => { ed.pagine.reverse(); }); }
async function edPaginaBianca() {
  const sel = edSelezionate();
  const rif = sel.length ? sel[sel.length - 1] : ed.pagine[ed.pagine.length - 1];
  let { w, h } = A4;
  if (rif && rif.f != null) {
    try {
      const vp = (await ed.fonti[rif.f].doc.getPage(rif.i + 1)).getViewport({ scale: 1 });
      w = vp.width; h = vp.height;
      if (rif.rot % 180) [w, h] = [h, w];
    } catch (e) { /* resta A4 */ }
  } else if (rif) { w = rif.w; h = rif.h; }
  edModifica(() => {
    const pos = rif ? ed.pagine.indexOf(rif) + 1 : ed.pagine.length;
    ed.pagine.splice(pos, 0, nuovaPagina({ f: null, i: 0, w, h }));
  });
}

// ── Clic, doppio clic e trascinamento nella griglia ──
const griglia = $('edGrid');
const paginaDa = (el) => { const c = el.closest('.pg'); return c ? ed.pagine.find((p) => p.id === +c.dataset.id) : null; };
griglia.addEventListener('click', (e) => {
  const p = paginaDa(e.target); if (!p) return;
  const a = e.target.closest('button')?.dataset.a;
  if (a === 'sx') return edRuota(-90, p.id);
  if (a === 'dx') return edRuota(90, p.id);
  if (a === 'del') return edElimina(p.id);
  if (a === 'zoom') return edApriAnteprima(ed.pagine.indexOf(p));
  if (e.shiftKey && ed.ancora != null) {
    const i1 = ed.pagine.findIndex((x) => x.id === ed.ancora), i2 = ed.pagine.indexOf(p);
    if (i1 >= 0) { const [a1, a2] = i1 < i2 ? [i1, i2] : [i2, i1]; for (let x = a1; x <= a2; x++) ed.pagine[x].sel = true; }
  } else {
    p.sel = !p.sel;
  }
  ed.ancora = p.id;
  edSoloSelezione();
});
griglia.addEventListener('dblclick', (e) => { const p = paginaDa(e.target); if (p && !e.target.closest('button')) edApriAnteprima(ed.pagine.indexOf(p)); });

function pulisciTrascina() {
  griglia.querySelectorAll('.ins-prima,.ins-dopo,.trascina').forEach((c) => c.classList.remove('ins-prima', 'ins-dopo', 'trascina'));
}
griglia.addEventListener('dragstart', (e) => {
  const p = paginaDa(e.target); if (!p) return;
  ed.trascinati = p.sel ? edSelezionate().map((x) => x.id) : [p.id];
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'snellino-pagine');
  setTimeout(() => ed.trascinati && ed.trascinati.forEach((id) => griglia.querySelector(`.pg[data-id="${id}"]`)?.classList.add('trascina')), 0);
});
griglia.addEventListener('dragover', (e) => {
  if (!ed.trascinati) return;
  e.preventDefault();
  griglia.querySelectorAll('.ins-prima,.ins-dopo').forEach((c) => c.classList.remove('ins-prima', 'ins-dopo'));
  const c = e.target.closest('.pg');
  if (!c) { ed.dest = null; return; }
  const r = c.getBoundingClientRect();
  const dopo = e.clientX > r.left + r.width / 2;
  c.classList.add(dopo ? 'ins-dopo' : 'ins-prima');
  ed.dest = { id: +c.dataset.id, dopo };
});
griglia.addEventListener('drop', (e) => {
  if (!ed.trascinati) return;
  e.preventDefault();
  const ids = ed.trascinati, dest = ed.dest;
  ed.trascinati = null; ed.dest = null; pulisciTrascina();
  if (!dest || ids.includes(dest.id)) return;
  edModifica(() => {
    const muovi = ed.pagine.filter((p) => ids.includes(p.id));
    const resto = ed.pagine.filter((p) => !ids.includes(p.id));
    const pos = resto.findIndex((p) => p.id === dest.id) + (dest.dopo ? 1 : 0);
    resto.splice(pos, 0, ...muovi);
    ed.pagine = resto;
  });
});
griglia.addEventListener('dragend', () => { ed.trascinati = null; ed.dest = null; pulisciTrascina(); });

// ── Anteprima grande ──
async function edApriAnteprima(idx) {
  if (idx < 0 || idx >= ed.pagine.length) return;
  ed.antIdx = idx;
  $('anteprima').style.display = 'flex';
  const p = ed.pagine[idx];
  const fonte = p.f != null ? ed.fonti[p.f] : null;
  $('antTitolo').textContent = `Pagina ${idx + 1} di ${ed.pagine.length}` + (fonte ? ` · ${fonte.nome}, p. ${p.i + 1}` : ' · pagina bianca');
  $('antSel').textContent = p.sel ? '✓ Selezionata' : 'Seleziona';
  const c = $('antCanvas'), dpr = window.devicePixelRatio || 1;
  const maxW = Math.min(1000, window.innerWidth * 0.88) - 30, maxH = window.innerHeight * 0.94 - 90;
  const ctx = c.getContext('2d');
  if (!fonte) {
    let w = p.w, h = p.h; if (p.rot % 180) [w, h] = [h, w];
    const s = Math.min(maxW / w, maxH / h);
    c.width = w * s * dpr; c.height = h * s * dpr; c.style.width = w * s + 'px';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    return;
  }
  const page = await fonte.doc.getPage(p.i + 1);
  if (ed.antIdx !== idx) return;
  const vp1 = page.getViewport({ scale: 1, rotation: (page.rotate + p.rot) % 360 });
  const s = Math.min(maxW / vp1.width, maxH / vp1.height);
  const vp = page.getViewport({ scale: s * dpr, rotation: (page.rotate + p.rot) % 360 });
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); c.style.width = (vp.width / dpr) + 'px';
  if (ed.antRender) { try { ed.antRender.cancel(); } catch (e) {} }
  ed.antRender = page.render({ canvasContext: ctx, viewport: vp });
  try { await ed.antRender.promise; } catch (e) { /* annullato passando a un'altra pagina */ }
}
function edAnteprimaVai(d) { const n = ed.antIdx + d; if (n >= 0 && n < ed.pagine.length) edApriAnteprima(n); }
function edAnteprimaSel() { const p = ed.pagine[ed.antIdx]; if (!p) return; p.sel = !p.sel; $('antSel').textContent = p.sel ? '✓ Selezionata' : 'Seleziona'; edSoloSelezione(); }
function edChiudiAnteprima() { $('anteprima').style.display = 'none'; ed.antIdx = -1; }

// ── Tastiera ──
document.addEventListener('keydown', (e) => {
  if (vistaAttiva() !== 'modifica' || !ed.fonti.length) return;
  if ($('anteprima').style.display !== 'none') {
    if (e.key === 'Escape') edChiudiAnteprima();
    else if (e.key === 'ArrowLeft') edAnteprimaVai(-1);
    else if (e.key === 'ArrowRight') edAnteprimaVai(1);
    else if (e.key === ' ') { e.preventDefault(); edAnteprimaSel(); }
    return;
  }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
    if (e.key === 'Enter' && document.activeElement.id === 'edIntervallo') edSelezionaIntervallo();
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); edAnnulla(); }
  else if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); edSeleziona('tutte'); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && edSelezionate().length) { e.preventDefault(); edElimina(); }
  else if (e.key === 'Escape') edSeleziona('nessuna');
});

// ── Costruzione del PDF (pdf-lib) ──
async function edLib(f) {
  const fonte = ed.fonti[f];
  if (!fonte.lib) fonte.lib = await PDFLib.PDFDocument.load(fonte.bytes, { ignoreEncryption: true, updateMetadata: false });
  return fonte.lib;
}
async function edCostruisci(pagine) {
  const { PDFDocument, degrees } = PDFLib;
  const out = await PDFDocument.create();
  // le pagine di ogni PDF si copiano in un colpo solo: font e immagini condivise non si duplicano
  const perFonte = new Map();
  pagine.forEach((p) => { if (p.f != null) { if (!perFonte.has(p.f)) perFonte.set(p.f, []); perFonte.get(p.f).push(p.i); } });
  const copiate = new Map();
  for (const [f, indici] of perFonte) {
    let src;
    try { src = await edLib(f); } catch (e) { throw new Error(`${ed.fonti[f].nome} non si può riscrivere (${e.message})`); }
    copiate.set(f, await out.copyPages(src, indici));
  }
  const usate = new Map();
  for (const p of pagine) {
    if (p.f == null) { const pg = out.addPage([p.w, p.h]); if (p.rot) pg.setRotation(degrees(p.rot)); continue; }
    const k = usate.get(p.f) || 0; usate.set(p.f, k + 1);
    const pg = copiate.get(p.f)[k];
    pg.setRotation(degrees((((pg.getRotation().angle || 0) + p.rot) % 360 + 360) % 360));
    out.addPage(pg);
  }
  out.setTitle(edNomeFile());
  out.setProducer('Snellino · PDE');
  return out.save({ useObjectStreams: true });
}

async function edComprimi(bytes) {
  await preparaMotore();
  const w = workers.find((x) => x.libero) || workers[0];
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const r = await w.invia({ tipo: 'comprimi', dati: buf, opz: OPZ }, [buf]);
  if (!r.ok) throw new Error(r.errore);
  return new Uint8Array(r.dati);
}

async function conAttesa(btn, testo, fn) {
  const prima = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${testo}`;
  try { await fn(); } catch (e) { console.warn('[Snellino]', e); toast('Operazione non riuscita: ' + e.message, true); }
  finally { btn.innerHTML = prima; btn.disabled = false; edDisegna(); }
}

function edSalva(compresso) {
  if (!ed.pagine.length) return;
  const btn = compresso ? $('edSalvaComp') : $('edSalvaNorm');
  conAttesa(btn, compresso ? 'Comprimo…' : 'Salvo…', async () => {
    const nome = edNomeFile() + '.pdf';
    let bytes = await edCostruisci(ed.pagine);
    if (compresso) {
      const prima = bytes.length;
      let ridotto = null;
      try { ridotto = await edComprimi(bytes); } catch (e) { console.warn('[Snellino] compressione', e); }
      if (ridotto && (prima - ridotto.length) / prima >= GUADAGNO_MIN) {
        bytes = ridotto;
        toast(`${nome}: ${fmtMB(prima)} → ${fmtMB(bytes.length)} (−${Math.round((prima - bytes.length) / prima * 100)}%)`);
      } else {
        toast(ridotto ? `${nome}: già leggero (${fmtMB(prima)}), salvato senza ricomprimere` : `${nome}: compressione non riuscita, salvato normale`, !ridotto);
      }
    } else {
      toast(`${nome} salvato (${fmtMB(bytes.length)})`);
    }
    salvaBlob(new Blob([bytes], { type: 'application/pdf' }), nome);
  });
}

function edEstrai() {
  const sel = edSelezionate();
  if (!sel.length) return;
  conAttesa(document.querySelector('[onclick="edEstrai()"]'), 'Estraggo…', async () => {
    const bytes = await edCostruisci(sel);
    salvaBlob(new Blob([bytes], { type: 'application/pdf' }), `${edNomeFile()} (estratto).pdf`);
  });
}

function edDividi() {
  const ogni = Math.max(1, parseInt($('edOgni').value, 10) || 1);
  if (!ed.pagine.length) return;
  const parti = [];
  for (let x = 0; x < ed.pagine.length; x += ogni) parti.push(ed.pagine.slice(x, x + ogni));
  if (parti.length < 2) { toast('Con queste impostazioni resta un solo file', true); return; }
  conAttesa(document.querySelector('[onclick="edDividi()"]'), `Divido in ${parti.length}…`, async () => {
    const base = edNomeFile(), cifre = String(ed.pagine.length).length;
    const zip = new JSZip();
    let da = 1;
    for (const parte of parti) {
      const a = da + parte.length - 1;
      const etichetta = parte.length === 1 ? `p${String(da).padStart(cifre, '0')}` : `p${String(da).padStart(cifre, '0')}-${String(a).padStart(cifre, '0')}`;
      zip.file(`${base} ${etichetta}.pdf`, await edCostruisci(parte));
      da = a + 1;
    }
    salvaBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${base} (diviso).zip`);
    toast(`${parti.length} PDF nello ZIP`);
  });
}

window.addEventListener('beforeunload', (e) => { if (ed.storia.length) { e.preventDefault(); e.returnValue = ''; } });
edDisegna();
