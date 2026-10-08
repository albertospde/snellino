"""Genera il logo di Snellino nello stile delle tessere AppSelling del PDE Hub
(Note di Credito, Converti Upload, Cedole): nodo di rete a sinistra, icona a tratto
blu sfumato (documento PDF con distintivo "comprimi"), titolo blu notte e sottotitolo ciano.
Uso:  py scripts/crea_logo.py   (dalla cartella del progetto)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

QUI = Path(__file__).resolve().parent.parent
OUT = QUI / "logo"
OUT.mkdir(exist_ok=True)

S = 4                                   # disegno a 4x, poi riduzione (bordi morbidi)
W, H = 780, 256
NAVY, BLU, AZZURRO, CIANO = (10, 45, 125), (16, 82, 196), (24, 128, 226), (22, 172, 236)
FONT_B = "C:/Windows/Fonts/segoeuib.ttf"
FONT_SB = "C:/Windows/Fonts/seguisb.ttf"


def p(*xy):
    return [v * S for v in xy]


def gradiente(w, h, c1, c2, diagonale=True):
    """Sfumatura da c1 (in alto a sinistra) a c2 (in basso a destra)."""
    g = Image.new("RGB", (w, h))
    px = g.load()
    for y in range(h):
        for x in range(w):
            t = ((x / w) * 0.55 + (y / h) * 0.45) if diagonale else x / w
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))
    return g


def font_per_cap(path, cap):
    size = cap
    for _ in range(30):
        f = ImageFont.truetype(path, size)
        b = f.getbbox("E")
        h = b[3] - b[1]
        if abs(h - cap) <= 1:
            return f
        size = round(size * cap / h)
    return f


def disegna(con_testo=True):
    img = Image.new("RGBA", (W * S, H * S), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)

    # ── nodo di rete (come nelle altre tessere) ──
    c = (60, 128)
    rami = [((20, 128), NAVY, 7), ((60, 88), AZZURRO, 7), ((60, 168), AZZURRO, 7), ((100, 128), CIANO, 8)]
    for (x, y), col, r in rami:
        d.line(p(*c, x, y), fill=BLU, width=4 * S)
    for (x, y), col, r in rami:
        d.ellipse(p(x - r, y - r, x + r, y + r), fill=col)
    d.ellipse(p(c[0] - 11, c[1] - 11, c[0] + 11, c[1] + 11), fill=NAVY)

    # ── documento PDF a tratto sfumato ──
    tratto = Image.new("L", img.size, 0)
    t = ImageDraw.Draw(tratto)
    x0, y0, x1, y1, piega = 138, 20, 262, 236, 36
    sp = 9 * S
    # contorno con l'angolo in alto a destra piegato
    t.line(p(x0, y0 + 12, x0, y1, x1, y1, x1, y0 + piega, x1 - piega, y0, x0, y0, x0, y0 + 12),
           fill=255, width=sp, joint="curve")
    for (cx, cy) in [(x0, y0), (x0, y1), (x1, y1), (x1 - piega, y0), (x1, y0 + piega)]:
        t.ellipse(p(cx - 4.5, cy - 4.5, cx + 4.5, cy + 4.5), fill=255)
    t.line(p(x1 - piega, y0, x1 - piega, y0 + piega, x1, y0 + piega), fill=255, width=7 * S, joint="curve")
    # righe di testo
    for yy, ww in [(118, 86), (138, 70), (158, 54)]:
        t.line(p(x0 + 22, yy, x0 + 22 + ww, yy), fill=255, width=7 * S)
    img.paste(gradiente(*img.size, NAVY, AZZURRO), mask=tratto)

    # scritta PDF dentro il documento
    f_pdf = font_per_cap(FONT_B, 27 * S)
    off = f_pdf.getbbox("P")[1]
    d.text((p(x0 + 20)[0], p(66)[0] - off), "PDF", font=f_pdf, fill=NAVY)

    # ── distintivo "comprimi": cerchio ciano con due frecce che stringono ──
    bx, by, br = 262, 190, 42
    d.ellipse(p(bx - br, by - br, bx + br, by + br), fill=(255, 255, 255, 255))
    anello = Image.new("L", img.size, 0)
    a = ImageDraw.Draw(anello)
    a.ellipse(p(bx - br + 4, by - br + 4, bx + br - 4, by + br - 4), outline=255, width=8 * S)
    lw = 7 * S
    # freccia dall'alto verso il centro
    a.line(p(bx, by - 26, bx, by - 8), fill=255, width=lw)
    a.line(p(bx - 11, by - 17, bx, by - 6, bx + 11, by - 17), fill=255, width=lw, joint="curve")
    # freccia dal basso verso il centro
    a.line(p(bx, by + 26, bx, by + 8), fill=255, width=lw)
    a.line(p(bx - 11, by + 17, bx, by + 6, bx + 11, by + 17), fill=255, width=lw, joint="curve")
    # barra centrale
    a.line(p(bx - 22, by, bx + 22, by), fill=255, width=5 * S)
    img.paste(gradiente(*img.size, AZZURRO, CIANO), mask=anello)

    if con_testo:
        f_tit = font_per_cap(FONT_B, 56 * S)
        f_sub = font_per_cap(FONT_SB, 22 * S)
        tx = 330
        off_t = f_tit.getbbox("S")[1]
        testo = Image.new("L", img.size, 0)
        ImageDraw.Draw(testo).text((p(tx)[0], p(78)[0] - off_t), "SNELLINO", font=f_tit, fill=255)
        img.paste(gradiente(*img.size, NAVY, BLU, diagonale=False), mask=testo)
        # sottotitolo spaziato
        x = p(tx + 3)[0]
        off_s = f_sub.getbbox("C")[1]
        for ch in "COMPRESSORE PDF":
            d.text((x, p(158)[0] - off_s), ch, font=f_sub, fill=CIANO)
            x += f_sub.getlength(ch) + 3 * S
    return img


def salva():
    grande = disegna(True)
    bbox = grande.getbbox()
    margine = 14 * S
    grande = grande.crop((max(0, bbox[0] - margine), 0, min(grande.width, bbox[2] + margine), grande.height))
    logo = grande.resize((grande.width // S, grande.height // S), Image.LANCZOS)
    bianco = Image.new("RGB", logo.size, (255, 255, 255))
    bianco.paste(logo, mask=logo.split()[3])
    bianco.save(OUT / "snellino-card-hub.png", optimize=True)          # tessera del PDE Hub
    logo.save(OUT / "snellino-logo.png", optimize=True)
    h = round(logo.height * 480 / logo.width)
    logo.resize((480, h), Image.LANCZOS).save(OUT / "snellino-logo-480.png", optimize=True)

    # icona quadrata (solo documento + distintivo) e favicon
    icona = disegna(False).crop((86 * S, 0, 86 * S + 256 * S, 256 * S))
    icona = icona.resize((256, 256), Image.LANCZOS)
    icona.save(OUT / "snellino-icona.png", optimize=True)
    icona.resize((64, 64), Image.LANCZOS).save(OUT / "snellino-favicon-64.png", optimize=True)
    print("Logo creato in", OUT, logo.size)


if __name__ == "__main__":
    salva()
