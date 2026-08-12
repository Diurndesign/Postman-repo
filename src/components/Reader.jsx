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

// Thèmes appliqués au CONTENU de l'epub (dans son iframe).
const THEMES_EPUB = {
  clair: { body: { color: "#1A1815 !important", background: "#F3F1EB !important" } },
  sepia: { body: { color: "#4A3728 !important", background: "#EFE6D2 !important" } },
  nuit: {
    body: { color: "#E8E4DA !important", background: "#0F0F0F !important" },
    a: { color: "#8FB7C0 !important" },
  },
};
const FONT_MIN = 80;
const FONT_MAX = 190;
const FONT_PAS = 10;

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
// Web : via le proxy /gutenberg. Natif : via CapacitorHttp (hors CORS).
async function chargerBuffer(livre) {
  let candidats = urlsEpubCandidates(livre);
  if (!candidats.length) {
    const r = await resoudreEpub(livre); // repli pour les 12 livres seed
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

// Injecte dans chaque chapitre : anti-débordement + gestes tactiles (swipe).
function preparerContenu(contents, rendition) {
  try {
    const doc = contents.document;
    const style = doc.createElement("style");
    style.textContent =
      "img,svg{max-width:100%!important;height:auto!important}" +
      "body{overflow-wrap:break-word;word-wrap:break-word;-webkit-hyphens:auto;hyphens:auto}" +
      "pre{white-space:pre-wrap!important}" +
      "table{max-width:100%!important;display:block;overflow-x:auto}";
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
  const [etat, setEtat] = useState("chargement"); // chargement | ok | erreur
  const [incipit, setIncipit] = useState(livre.incipit || "");

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

        // Dimensions numériques mesurées sur l'élément : évite que epub.js
        // calcule une colonne plus large que l'écran (texte coupé à droite).
        const rect = el.getBoundingClientRect();
        const rendition = book.renderTo(el, {
          width: Math.max(1, Math.floor(rect.width)),
          height: Math.max(1, Math.floor(rect.height)),
          flow: "paginated",
          spread: "none",
          minSpreadWidth: 100000, // force une seule colonne
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
          if (loc && loc.start && loc.start.cfi) {
            ecrire(CLE_POS + livre.id, loc.start.cfi);
          }
        });

        // Reflow quand l'écran change de taille (rotation, redimensionnement).
        onResize = () => {
          try {
            const r = el.getBoundingClientRect();
            rendition.resize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)));
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

  // Clavier : flèches = pages, Échap = fermer.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft") renditionRef.current && renditionRef.current.prev();
      else if (e.key === "ArrowRight") renditionRef.current && renditionRef.current.next();
      else if (e.key === "Escape") onFermer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFermer]);

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

  return (
    <div className="tr-reader" data-lect={theme}>
      <header className="tr-reader-bar">
        <span className="tr-reader-titre">{livre.titre}</span>
        <button
          className="tr-reader-fermer"
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
      </div>

      {etat === "ok" && (
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
          <div className="tr-outils-groupe">
            <button onClick={precedent} aria-label="Page précédente">
              ‹
            </button>
            <button onClick={suivant} aria-label="Page suivante">
              ›
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
