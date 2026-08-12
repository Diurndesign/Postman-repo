import React, { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import {
  resoudreEpub,
  urlLecture,
  chargerIncipit,
  urlsEpubCandidates,
} from "../api/gutendex.js";
import { estNatif, telechargerEpubBuffer } from "../native.js";

/* ------------------------------------------------------------------ */
/*  Préférences de lecture (persistées)                                */
/* ------------------------------------------------------------------ */
const CLE_POS = "tranche.pos.";
const CLE_FONT = "tranche.reader.font";
const CLE_THEME = "tranche.reader.theme";

const ORDRE_THEME = ["clair", "sepia", "nuit"];
const ICONE_THEME = { clair: "☀", sepia: "◐", nuit: "☾" };
const NOM_THEME = { clair: "Clair", sepia: "Sépia", nuit: "Veilleuse" };

const FONT_MIN = 80;
const FONT_MAX = 190;
const FONT_PAS = 10;

// Thèmes appliqués AU CONTENU de l'epub. On force la couleur ET le fond sur
// tous les éléments de texte pour éviter le « texte invisible » (ex. texte
// sombre resté sombre en veilleuse) et pour que le thème s'applique vraiment
// au livre, pas seulement à l'habillage.
const SEL_TEXTE =
  "p,div,span,section,article,main,li,ul,ol,dl,dd,dt,blockquote,figure,figcaption,h1,h2,h3,h4,h5,h6,em,strong,i,b,small,sub,sup,td,th,tr,table,caption,pre,code,hr";

function themeEpub(bg, texte, lien) {
  return {
    "html, body": { background: bg + " !important", color: texte + " !important" },
    [SEL_TEXTE]: {
      color: texte + " !important",
      "background-color": "transparent !important",
    },
    a: { color: lien + " !important" },
    "img, svg": { "max-width": "100% !important", height: "auto !important" },
  };
}

const THEMES_EPUB = {
  clair: themeEpub("#F3F1EB", "#1A1815", "#1D4E5A"),
  sepia: themeEpub("#EFE6D2", "#4A3728", "#7A3B1B"),
  nuit: themeEpub("#0F0F0F", "#E8E4DA", "#8FB7C0"),
};

function lire(cle, defaut) {
  try {
    const v = localStorage.getItem(cle);
    return v == null ? defaut : v;
  } catch (e) {
    return defaut;
  }
}
function ecrire(cle, val) {
  try {
    localStorage.setItem(cle, val);
  } catch (e) {
    /* ignore */
  }
}

// Télécharge l'epub en ArrayBuffer, en essayant chaque URL candidate.
async function chargerBuffer(livre) {
  let candidats = urlsEpubCandidates(livre);
  if (!candidats.length) {
    const r = await resoudreEpub(livre);
    if (r) candidats = [r];
  }
  for (const u of candidats) {
    try {
      let buffer;
      if (estNatif()) {
        buffer = await telechargerEpubBuffer(u);
      } else {
        const rep = await fetch(urlLecture(u));
        if (!rep.ok) continue;
        buffer = await rep.arrayBuffer();
      }
      if (buffer && buffer.byteLength > 0) return buffer;
    } catch (e) {
      /* URL suivante */
    }
  }
  throw new Error("epub illisible");
}

// Anti-débordement + gestes tactiles (swipe) injectés dans chaque chapitre.
function preparerContenu(contents, rendition) {
  try {
    const doc = contents.document;
    const style = doc.createElement("style");
    style.textContent =
      "img,svg{max-width:100%!important;height:auto!important}" +
      "body{overflow-wrap:break-word;word-wrap:break-word;-webkit-hyphens:auto;hyphens:auto}" +
      "pre{white-space:pre-wrap!important}" +
      "table{max-width:100%!important}";
    (doc.head || doc.documentElement).appendChild(style);

    let x0 = null;
    let y0 = null;
    doc.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        x0 = t.clientX;
        y0 = t.clientY;
      },
      { passive: true }
    );
    doc.addEventListener(
      "touchend",
      (e) => {
        if (x0 == null) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - x0;
        const dy = t.clientY - y0;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) rendition.next();
          else rendition.prev();
        }
        x0 = null;
      },
      { passive: true }
    );
  } catch (e) {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Lecteur                                                            */
/* ------------------------------------------------------------------ */
export default function Reader({ livre, onFermer }) {
  const viewerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const locPretesRef = useRef(false);
  const [etat, setEtat] = useState("chargement"); // chargement | ok | erreur
  const [incipit, setIncipit] = useState(livre.incipit || "");
  const [toc, setToc] = useState([]);
  const [tocOuvert, setTocOuvert] = useState(false);
  const [progress, setProgress] = useState(null);

  const [font, setFont] = useState(() => {
    const n = parseInt(lire(CLE_FONT, "100"), 10);
    return Number.isFinite(n) ? Math.min(FONT_MAX, Math.max(FONT_MIN, n)) : 100;
  });
  const [theme, setTheme] = useState(() => {
    const t = lire(CLE_THEME, "clair");
    return ORDRE_THEME.includes(t) ? t : "clair";
  });
  const fontRef = useRef(font);
  const themeRef = useRef(theme);
  fontRef.current = font;
  themeRef.current = theme;

  useEffect(() => {
    let annule = false;
    let onResize = null;

    async function charger() {
      setEtat("chargement");
      try {
        const buffer = await chargerBuffer(livre);
        if (annule) return;

        const el = viewerRef.current;
        const book = ePub(buffer);
        bookRef.current = book;
        await book.ready;
        if (annule) return;

        const rect = el.getBoundingClientRect();
        const rendition = book.renderTo(el, {
          width: Math.max(1, Math.floor(rect.width)),
          height: Math.max(1, Math.floor(rect.height)),
          flow: "paginated",
          spread: "none",
          minSpreadWidth: 100000,
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        Object.entries(THEMES_EPUB).forEach(([k, v]) =>
          rendition.themes.register(k, v)
        );
        rendition.themes.select(themeRef.current);
        rendition.themes.fontSize(fontRef.current + "%");
        rendition.hooks.content.register((c) => preparerContenu(c, rendition));

        const pos = lire(CLE_POS + livre.id, null);
        await rendition.display(pos || undefined);
        if (annule) return;

        rendition.on("relocated", (loc) => {
          if (!loc || !loc.start) return;
          if (loc.start.cfi) ecrire(CLE_POS + livre.id, loc.start.cfi);
          if (locPretesRef.current) {
            try {
              const p = book.locations.percentageFromCfi(loc.start.cfi);
              if (typeof p === "number" && p >= 0) setProgress(Math.round(p * 100));
            } catch (e) {
              /* ignore */
            }
          }
        });

        // Sommaire (chapitres)
        book.loaded.navigation
          .then((nav) => {
            if (!annule && nav && Array.isArray(nav.toc)) setToc(nav.toc);
          })
          .catch(() => {});

        // Progression : génération des positions en tâche de fond
        book.locations
          .generate(1600)
          .then(() => {
            if (annule) return;
            locPretesRef.current = true;
            try {
              const cur = rendition.currentLocation();
              if (cur && cur.start && cur.start.cfi) {
                const p = book.locations.percentageFromCfi(cur.start.cfi);
                if (typeof p === "number" && p >= 0) setProgress(Math.round(p * 100));
              }
            } catch (e) {
              /* ignore */
            }
          })
          .catch(() => {});

        onResize = () => {
          try {
            const r = el.getBoundingClientRect();
            rendition.resize(
              Math.max(1, Math.floor(r.width)),
              Math.max(1, Math.floor(r.height))
            );
          } catch (e) {
            /* ignore */
          }
        };
        window.addEventListener("resize", onResize);

        setEtat("ok");
      } catch (e) {
        if (annule) return;
        if (!incipit && livre.texteUrl) {
          const debut = await chargerIncipit(livre.texteUrl);
          if (!annule && debut) setIncipit(debut);
        }
        if (!annule) setEtat("erreur");
      }
    }

    charger();

    return () => {
      annule = true;
      locPretesRef.current = false;
      if (onResize) window.removeEventListener("resize", onResize);
      try {
        if (renditionRef.current) renditionRef.current.destroy();
      } catch (e) {
        /* ignore */
      }
      try {
        if (bookRef.current) bookRef.current.destroy();
      } catch (e) {
        /* ignore */
      }
      renditionRef.current = null;
      bookRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livre]);

  // Clavier : flèches = pages, Échap = fermer / refermer le sommaire.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft") renditionRef.current && renditionRef.current.prev();
      else if (e.key === "ArrowRight") renditionRef.current && renditionRef.current.next();
      else if (e.key === "Escape") {
        if (tocOuvert) setTocOuvert(false);
        else onFermer();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFermer, tocOuvert]);

  function precedent() {
    if (renditionRef.current) renditionRef.current.prev();
  }
  function suivant() {
    if (renditionRef.current) renditionRef.current.next();
  }
  function changerFont(delta) {
    setFont((f) => {
      const nf = Math.min(FONT_MAX, Math.max(FONT_MIN, f + delta));
      ecrire(CLE_FONT, String(nf));
      if (renditionRef.current) renditionRef.current.themes.fontSize(nf + "%");
      return nf;
    });
  }
  function changerTheme() {
    setTheme((t) => {
      const nt = ORDRE_THEME[(ORDRE_THEME.indexOf(t) + 1) % ORDRE_THEME.length];
      ecrire(CLE_THEME, nt);
      if (renditionRef.current) renditionRef.current.themes.select(nt);
      return nt;
    });
  }
  function allerChapitre(href) {
    if (renditionRef.current && href) renditionRef.current.display(href);
    setTocOuvert(false);
  }

  return (
    <div className="tr-reader" data-lect={theme}>
      <header className="tr-reader-bar">
        <button
          className="tr-reader-icone"
          onClick={() => setTocOuvert(true)}
          disabled={!toc.length}
          aria-label="Chapitres"
          title="Chapitres"
        >
          ☰
        </button>
        <span className="tr-reader-titre">{livre.titre}</span>
        <button
          className="tr-reader-icone"
          onClick={onFermer}
          aria-label="Fermer le lecteur"
        >
          ✕
        </button>
      </header>

      <div className="tr-reader-scene">
        <div ref={viewerRef} className="tr-reader-viewer" />

        {etat === "chargement" && (
          <div className="tr-reader-overlay">
            <span className="tr-reader-spin" />
            <p>Ouverture du livre…</p>
          </div>
        )}

        {etat === "erreur" && (
          <div className="tr-reader-overlay tr-reader-repli">
            <p className="tr-reader-msg">
              La lecture n'est pas disponible pour le moment.
            </p>
            {incipit ? (
              <>
                <p className="tr-reader-incipit">« {incipit} »</p>
                <p className="tr-reader-sign">— début de « {livre.titre} »</p>
              </>
            ) : (
              <p className="tr-reader-sign">
                {livre.auteur} — {livre.titre}
              </p>
            )}
          </div>
        )}

        {tocOuvert && (
          <div className="tr-toc-fond" onClick={() => setTocOuvert(false)}>
            <nav className="tr-toc" onClick={(e) => e.stopPropagation()}>
              <h3 className="tr-toc-titre">Chapitres</h3>
              <ul className="tr-toc-liste">
                {toc.map((it, i) => (
                  <li key={it.href || i}>
                    <button onClick={() => allerChapitre(it.href)}>
                      {(it.label || "").trim() || "Chapitre"}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        )}
      </div>

      {etat === "ok" && (
        <>
          <div className="tr-reader-progress" aria-hidden="true">
            <i style={{ width: (progress == null ? 0 : progress) + "%" }} />
          </div>
          <footer className="tr-reader-outils">
            <div className="tr-outils-groupe">
              <button
                onClick={() => changerFont(-FONT_PAS)}
                disabled={font <= FONT_MIN}
                aria-label="Réduire le texte"
              >
                A−
              </button>
              <button
                onClick={() => changerFont(FONT_PAS)}
                disabled={font >= FONT_MAX}
                aria-label="Agrandir le texte"
              >
                A+
              </button>
              <button
                onClick={changerTheme}
                aria-label={`Thème de lecture : ${NOM_THEME[theme]}. Cliquer pour changer.`}
                title={`Thème : ${NOM_THEME[theme]}`}
              >
                {ICONE_THEME[theme]}
              </button>
            </div>

            <span className="tr-reader-pct">
              {progress == null ? "…" : progress + " %"}
            </span>

            <div className="tr-outils-groupe">
              <button onClick={precedent} aria-label="Page précédente">
                ‹
              </button>
              <button onClick={suivant} aria-label="Page suivante">
                ›
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
