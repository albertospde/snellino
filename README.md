# Snellino — Compressore PDF

App del PDE Hub (sezione **AppSelling & Utility**) per alleggerire i PDF degli editori prima di
caricarli in **BookUp → Giri Vendita → Materiali PDF**. Pubblicata su GitHub Pages come
`albertospde.github.io/snellino/` e aperta dal Hub in una scheda interna.

## Come funziona
- Si trascinano PDF singoli o intere cartelle (anche più cartelle, con sottocartelle), oppure
  "Scegli cartella" / "Scegli file PDF".
- La compressione avviene **nel browser** con Ghostscript compilato in WebAssembly
  (`gs-worker.js` + `vendor/ghostscript/`): i file non escono mai dal PC.
- Regole: immagini a colori e in grigio oltre **250 dpi** portate a **200 dpi**, JPEG qualità **85**
  (QFactor 0,30); i JPEG sotto soglia passano intatti, le immagini in bianco/nero non si toccano,
  le pagine non vengono ruotate. Se il guadagno è **sotto il 5%** (o il PDF non si può elaborare,
  es. protetto da password) resta il file originale.
- Tabella prima/dopo per file e totale; **Scarica ZIP** con la stessa struttura di cartelle e gli
  stessi nomi file. Su Chrome/Edge c'è anche "Salva in una cartella" che scrive direttamente su disco.

## Accesso
Login con le credenziali del PDE Hub (Supabase "PDE HUB"; se si arriva dal Hub la sessione c'è già).
Gli utenti con ruolo `agente` vedono "Accesso non autorizzato" e nel Hub la tessera è nascosta
(come tutta la sezione AppSelling): il caricamento dei Materiali PDF in BookUp è solo per gli admin.
Supabase serve solo per il login: nessun file viene caricato.

## Sviluppo
- Server locale: `py -m http.server 8767` e apri `http://localhost:8767/?prova` (salta il login solo su localhost).
- Logo: `py scripts/crea_logo.py` rigenera i file in `logo/` (`snellino-card-hub.png` è la tessera del Hub).
- Ghostscript WASM: pacchetto npm `@jspawn/ghostscript-wasm` 0.0.2 (licenza AGPL-3.0, vedi `vendor/ghostscript/LICENSE`).
