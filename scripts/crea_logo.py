"""Genera il logo di Snellino nello stile di Giro Manager e PDE Festival, con un tocco divertente.

Stessi caratteri (Century Gothic) e colori: "SNELL" blu notte in grassetto, "INO" blu, motto
spaziato sotto. Il pavone del PDE Hub (ritagliato dal logo Giro Manager) è "a dieta": davanti il
pavone snellito, dietro l'ombra azzurra di com'era prima, e due frecce che lo stringono.
Uso:  py scripts/crea_logo.py   (dalla cartella del progetto)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

QUI = Path(__file__).resolve().parent.parent
GIRO = QUI.parent / "GIRO MANAGER" / "public" / "logo"
OUT = QUI / "logo"
OUT.mkdir(exist_ok=True)

NAVY, BLU, CIANO = (0, 28, 80, 255), (0, 92, 224, 255), (16, 172, 224, 255)
OMBRA = (16, 172, 224, 70)
FONT_B = "C:/Windows/Fonts/GOTHICB.TTF"
FONT_R = "C:/Windows/Fonts/GOTHIC.TTF"

sorgente = Image.open(GIRO / "giro-manager-logo.png").convert("RGBA")
pavone = sorgente.crop((1797, 0, 2181, sorgente.height))      # 384 × 489, pavone tra y 38 e 446
H = sorgente.height
CAP_TOP, CAP_BOTTOM = 150, 360                                 # maiuscole più grandi di Giro Manager
TAG_TOP = 412
SNELLO = 0.52                                                  # quanto è dimagrito il pavone


def font_per_cap(path, cap):
    """Font con altezza delle maiuscole pari a `cap` pixel."""
    size = cap
    for _ in range(30):
        f = ImageFont.truetype(path, size)
        b = f.getbbox("E")
        h = b[3] - b[1]
        if abs(h - cap) <= 1:
            return f
        size = round(size * cap / h)
    return f


def tinta(img, colore):
    """Stessa sagoma, un solo colore (per l'ombra del pavone di prima)."""
    pieno = Image.new("RGBA", img.size, colore)
    alfa = img.split()[3].point(lambda a: a * colore[3] // 255)
    pieno.putalpha(alfa)
    return pieno


def freccia(d, x, y, verso, colore, s=1.0):
    """Chevron doppio che spinge verso il pavone (verso = +1 → destra)."""
    w = 13 * s
    for k in (0, 1):
        x0 = x + verso * k * 38 * s
        d.line([(x0 - verso * 26 * s, y - 36 * s), (x0, y), (x0 - verso * 26 * s, y + 36 * s)],
               fill=colore, width=round(w), joint="curve")
        for (px, py) in [(x0 - verso * 26 * s, y - 36 * s), (x0, y), (x0 - verso * 26 * s, y + 36 * s)]:
            d.ellipse([px - w / 2, py - w / 2, px + w / 2, py + w / 2], fill=colore)


def pavone_a_dieta(s=1.0):
    """Ombra del pavone di prima + pavone snellito + frecce. Ritorna immagine RGBA."""
    pw, ph = pavone.size
    sottile = pavone.resize((round(pw * SNELLO), ph), Image.LANCZOS)
    margine = 0
    img = Image.new("RGBA", (pw + margine, ph), (255, 255, 255, 0))
    ombra = tinta(pavone, OMBRA)
    img.alpha_composite(ombra, (margine, 0))
    # il pavone snellito tiene la testa e la coda dove stavano (allineato a destra)
    img.alpha_composite(sottile, (margine + pw - sottile.width, 0))
    d = ImageDraw.Draw(img)
    # frecce sull'ombra che spingono il ventaglio a destra: "stringi!"
    freccia(d, margine + pw - sottile.width - 30, 232, +1, CIANO)
    return img


def logo_completo(con_pavone=True):
    cap = CAP_BOTTOM - CAP_TOP
    f_pde = font_per_cap(FONT_B, cap)
    f_nome = font_per_cap(FONT_R, cap)
    f_tag = font_per_cap(FONT_B, 40)
    pav = pavone_a_dieta()

    X0 = 41
    w_pde = f_pde.getlength("SNELL")
    gap = 6
    w_nome = f_nome.getlength("INO")
    x_pav = int(X0 + w_pde + gap + w_nome + 10)
    W = x_pav + pav.width + 38

    img = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    d.text((X0, CAP_TOP - f_pde.getbbox("E")[1]), "SNELL", font=f_pde, fill=NAVY)
    d.text((X0 + w_pde + gap, CAP_TOP - f_nome.getbbox("E")[1]), "INO", font=f_nome, fill=BLU)

    # motto come in Giro Manager: tre parti, tre colori, barre in mezzo, molto spaziato
    spazio = 7
    x = X0 + 3
    y = TAG_TOP - f_tag.getbbox("E")[1]
    for t, col in [("COMPRIMI.", NAVY), ("I", NAVY), ("UNISCI.", BLU), ("I", BLU), ("DIMAGRISCI.", CIANO)]:
        for c in t:
            d.text((x, y), c, font=f_tag, fill=col)
            x += f_tag.getlength(c) + spazio
        x += 20

    if con_pavone:
        img.alpha_composite(pav, (x_pav, 0))
    img = img.crop(img.getbbox())
    pad = 40
    logo = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (255, 255, 255, 0))
    logo.alpha_composite(img, (pad, pad))
    return logo


def su_bianco(img):
    b = Image.new("RGB", img.size, (255, 255, 255))
    b.paste(img, mask=img.split()[3])
    return b


def salva():
    logo = logo_completo()
    logo.save(OUT / "snellino-logo.png", optimize=True)
    # versioni per l'app (intestazione e login): margine sottile, così la scritta riempie il riquadro
    app = logo.crop(logo.getbbox())
    m = 10
    app_m = Image.new("RGBA", (app.width + 2 * m, app.height + 2 * m), (255, 255, 255, 0))
    app_m.alpha_composite(app, (m, m))
    for w in (480, 960):
        h = round(app_m.height * w / app_m.width)
        app_m.resize((w, h), Image.LANCZOS).save(OUT / f"snellino-logo-{w}.png", optimize=True)

    # tessera del PDE Hub: 600 × 247 su bianco. Il riquadro del Hub è stretto (circa 2,4:1),
    # quindi qui il pavone è alto quanto tutto il blocco di testo e la scritta viene più grande.
    testo = logo_completo(con_pavone=False)
    testo = testo.crop(testo.getbbox())
    pav = pavone_a_dieta()
    pav = pav.crop(pav.getbbox())
    hp = round(testo.height * 1.28)
    pav = pav.resize((round(pav.width * hp / pav.height), hp), Image.LANCZOS)
    stretto = Image.new("RGBA", (testo.width + 30 + pav.width, hp), (255, 255, 255, 0))
    stretto.alpha_composite(testo, (0, (hp - testo.height) // 2 + round(testo.height * 0.04)))
    stretto.alpha_composite(pav, (testo.width + 30, 0))
    # ritaglio stretto con un filo di margine: nel Hub la tessera ha width:86%;height:74% (vedi index.html del Hub)
    m = 12
    card = Image.new("RGBA", (stretto.width + 2 * m, stretto.height + 2 * m), (255, 255, 255, 255))
    card.alpha_composite(stretto, (m, m))
    card = card.resize((720, round(card.height * 720 / card.width)), Image.LANCZOS)
    su_bianco(card).save(OUT / "snellino-card-hub.png", optimize=True)

    # icona quadrata e favicon: solo il pavone a dieta
    pav = pavone_a_dieta()
    pav = pav.crop(pav.getbbox())
    lato = round(max(pav.size) * 1.12)
    icona = Image.new("RGBA", (lato, lato), (255, 255, 255, 0))
    icona.alpha_composite(pav, ((lato - pav.width) // 2, (lato - pav.height) // 2))
    icona.resize((512, 512), Image.LANCZOS).save(OUT / "snellino-icona.png", optimize=True)
    icona.resize((64, 64), Image.LANCZOS).save(OUT / "snellino-favicon-64.png", optimize=True)
    print("Logo creato in", OUT, logo.size)


if __name__ == "__main__":
    salva()
