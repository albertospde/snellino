// Snellino — worker di compressione PDF con Ghostscript (WebAssembly).
// Il PDF arriva come ArrayBuffer dalla pagina e torna compresso: nessun dato esce dal browser.
'use strict';

self.exports = {};
importScripts('vendor/ghostscript/gs.js');
const creaGhostscript = self.exports.Module;

// Il .wasm (16 MB) si compila una volta sola per worker; ogni file usa poi un'istanza nuova
// (Ghostscript è un programma "a riga di comando": un'esecuzione per istanza).
let wasmModulo = null;
async function compilaWasm() {
  if (wasmModulo) return wasmModulo;
  const url = 'vendor/ghostscript/gs.wasm';
  try {
    wasmModulo = await WebAssembly.compileStreaming(fetch(url));
  } catch (e) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Motore Ghostscript non scaricato (' + r.status + ')');
    wasmModulo = await WebAssembly.compile(await r.arrayBuffer());
  }
  return wasmModulo;
}

// Parametri: immagini a colori/grigi oltre 250 dpi (200 × 1,25) portate a 200 dpi, JPEG qualità 85
// (QFactor 0,30 ≈ qualità libjpeg 85). I JPEG già sotto soglia passano intatti; il bianco/nero
// (testo scansionato) non si tocca. Pagine mai ruotate, link e annotazioni conservati.
function argomentiGs(dpi, soglia, qfactor) {
  const dict = `<< /QFactor ${qfactor} /Blend 1 /HSamples [2 1 1 2] /VSamples [2 1 1 2] >>`;
  return [
    '-sDEVICE=pdfwrite', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-dQUIET',
    '-dAutoRotatePages=/None', '-dPrinted=false',
    '-sColorConversionStrategy=LeaveColorUnchanged',
    '-dEmbedAllFonts=true', '-dSubsetFonts=true', '-dCompressFonts=true',
    '-dDetectDuplicateImages=true', '-dPassThroughJPEGImages=true',
    '-dDownsampleColorImages=true', '-dColorImageDownsampleType=/Bicubic',
    `-dColorImageResolution=${dpi}`, `-dColorImageDownsampleThreshold=${soglia}`,
    '-dDownsampleGrayImages=true', '-dGrayImageDownsampleType=/Bicubic',
    `-dGrayImageResolution=${dpi}`, `-dGrayImageDownsampleThreshold=${soglia}`,
    '-dDownsampleMonoImages=false',
    '-dAutoFilterColorImages=true', '-dAutoFilterGrayImages=true',
    '-sOutputFile=/out.pdf',
    '-c', `<< /ColorACSImageDict ${dict} /GrayACSImageDict ${dict} /ColorImageDict ${dict} /GrayImageDict ${dict} >> setdistillerparams`,
    '-f', '/in.pdf',
  ];
}

async function comprimi(dati, opz) {
  const modulo = await compilaWasm();
  const log = [];
  const gs = await creaGhostscript({
    noInitialRun: true,
    print: (t) => log.push(t),
    printErr: (t) => log.push(t),
    instantiateWasm(imports, ok) {
      WebAssembly.instantiate(modulo, imports).then((ist) => ok(ist, modulo));
      return {};
    },
  });
  gs.FS.writeFile('/in.pdf', new Uint8Array(dati));
  let codice = 0;
  try {
    codice = gs.callMain(argomentiGs(opz.dpi, opz.soglia, opz.qfactor));
  } catch (e) {
    // exit() di Emscripten arriva come eccezione ExitStatus
    if (e && typeof e.status === 'number') codice = e.status;
    else throw e;
  }
  let out = null;
  try { out = gs.FS.readFile('/out.pdf'); } catch (e) { /* nessun output */ }
  if (codice !== 0 || !out || out.length < 100) {
    const motivo = log.filter(Boolean).slice(-4).join(' ').trim();
    throw new Error(motivo || ('Ghostscript ha restituito il codice ' + codice));
  }
  // copia fuori dalla memoria dell'istanza, che poi viene buttata
  return out.slice().buffer;
}

self.onmessage = async (ev) => {
  const { id, tipo, dati, opz } = ev.data;
  if (tipo === 'prepara') {
    try { await compilaWasm(); self.postMessage({ id, ok: true }); }
    catch (e) { self.postMessage({ id, ok: false, errore: String(e && e.message || e) }); }
    return;
  }
  try {
    const out = await comprimi(dati, opz);
    self.postMessage({ id, ok: true, dati: out }, [out]);
  } catch (e) {
    self.postMessage({ id, ok: false, errore: String(e && e.message || e) });
  }
};
