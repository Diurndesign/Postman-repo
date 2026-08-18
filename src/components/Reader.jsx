import React, { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import {
  resoudreEpub,
  urlLecture,
  chargerIncipit,
  urlsEpubCandidates,
} from "../api/gutendex.js";
import { urlsEpubWs } from "../api/wikisource.js";
import { estNatif, telechargerEpubBuffer } from "../native.js";
import * as stockage from "../stockage.js";

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

// Borne la taille de police lue depuis le stockage.
function normaliserFont(brut) {
  const n = parseInt(brut || "100", 10);
  return Number.isFinite(n) ? Math.min(FONT_MAX, Math.max(FONT_MIN, n)) : 100;
}

// Un epub est un zip : il commence par la signature « PK » (0x50 0x4B).
// Ça permet de détecter quand le proxy renvoie du HTML/erreur au lieu du fichier.
function estEpub(buffer) {
  if (!buffer || buffer.byteLength < 4) return false;
  const b = new Uint8Array(buffer, 0, 2);
  return b[0] === 0x50 && b[1] === 0x4b;
}

// Récupère un epub en ArrayBuffer depuis une URL (proxy web / natif).
async function bufferDepuis(url) {
  if (estNatif()) return telechargerEpubBuffer(url);
  const rep = await fetch(urlLecture(url));
  if (!rep.ok) throw new Error("HTTP " + rep.status);
  return rep.arrayBuffer();
}

// Télécharge l'epub en ArrayBuffer, en essayant chaque URL candidate et en
// vérifiant qu'on a bien reçu un epub.
async function chargerBuffer(livre) {
  // Source Wikisource : epub généré à la volée par ws-export (epub-3 puis epub).
  if (livre.sourceType === "wikisource" && livre.wsPage) {
    for (const u of urlsEpubWs(livre.wsPage)) {
      try {
        const buffer = await bufferDepuis(u);
        if (estEpub(buffer)) return buffer;
      } catch (e) {
        /* format suivant */
      }
    }
    throw new Error("epub Wikisource illisible");
  }

  let candidats = urlsEpubCandidates(livre);
  if (!candidats.length) {
    const trouve = await resoudreEpub(livre); // { id, epubUrl } | null
    if (trouve) {
      candidats = urlsEpubCandidates({
        gutenbergId: trouve.id,
        epubUrl: trouve.epubUrl,
      });
    }
  }
  for (const u of candidats) {
    try {
      const buffer = await bufferDepuis(u);
      if (estEpub(buffer)) return buffer;
    } catch (e) {
      /* URL suivante */
    }
  }
  throw new Error("epub illisible");
}

// Adapte le contenu de chaque chapitre : marges propres, rien qui déborde
// en largeur (le texte s'ajuste toujours à l'écran).
function preparerContenu(contents) {
  try {
    const doc = contents.document;
    const style = doc.createElement("style");
    style.textContent =
      "html,body{margin:0!important;max-width:100%!important;overflow-x:hidden!important}" +
      "body{padding:6px 18px 40px!important;box-sizing:border-box!important;overflow-wrap:break-word;word-wrap:break-word;-webkit-hyphens:auto;hyphens:auto}" +
      "img,svg{max-width:100%!important;height:auto!important}" +
      "pre{white-space:pre-wrap!important}" +
      "table{max-width:100%!important;display:block;overflow-x:auto}";
    (doc.head || doc.documentElement).appendChild(style);
  } catch (e) {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Lecteur                                                            */
/* ------------------------------------------------------------------ */
export default function Reader({ livre, onFermer, onProgress, onTermine }) {
  const viewerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const dernierPct = useRef(-1); // dernier % rapporté (throttle)
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const [etat, setEtat] = useState("chargement"); // chargement | ok | erreur
  const [incipit, setIncipit] = useState(livre.incipit || "");
  const [toc, setToc] = useState([]);
  const [tocOuvert, setTocOuvert] = useState(false);
  const [progress, setProgress] = useState(null);

  // Valeurs par défaut ; les préférences réelles sont hydratées (async) au
  // montage, avant l'application au rendu epub (voir charger()).
  const [font, setFont] = useState(100);
  const [theme, setTheme] = useState("clair");
  const fontRef = useRef(font);
  const themeRef = useRef(theme);
  fontRef.current = font;
  themeRef.current = theme;

  useEffect(() => {
    let annule = false;

    async function charger() {
      setEtat("chargement");
      try {
        // Préférences de lecture (durables, asynchrones) — lues avant
        // d'initialiser le rendu pour les appliquer d'emblée.
        const [fSaved, tSaved] = await Promise.all([
          stockage.get(CLE_FONT),
          stockage.get(CLE_THEME),
        ]);
        if (annule) return;
        const f = normaliserFont(fSaved);
        const t = ORDRE_THEME.includes(tSaved) ? tSaved : "clair";
        fontRef.current = f;
        themeRef.current = t;
        setFont(f);
        setTheme(t);

        const buffer = await chargerBuffer(livre);
        if (annule) return;

        const el = viewerRef.current;
        const book = ePub(buffer);
        bookRef.current = book;
        await book.ready;
        if (annule) return;

        // Lecture par défilement, gestionnaire PAR DÉFAUT (scrolled-doc) :
        // le mode "continuous" d'epub.js rendait l'iframe plus large que
        // l'écran (texte coupé à droite). scrolled-doc ajuste à la largeur
        // du conteneur de façon fiable.
        const rendition = book.renderTo(el, {
          width: "100%",
          height: "100%",
          flow: "scrolled-doc",
          spread: "none",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        Object.entries(THEMES_EPUB).forEach(([k, v]) =>
          rendition.themes.register(k, v)
        );
        rendition.themes.select(themeRef.current);
        rendition.themes.fontSize(fontRef.current + "%");
        rendition.hooks.content.register((c) => preparerContenu(c));

        const pos = await stockage.get(CLE_POS + livre.id);
        if (annule) return;
        await rendition.display(pos || undefined);
        if (annule) return;

        const totalSpine =
          (book.spine &&
            (book.spine.length ||
              (book.spine.items && book.spine.items.length) ||
              (book.spine.spineItems && book.spine.spineItems.length))) ||
          1;

        rendition.on("relocated", (loc) => {
          if (!loc || !loc.start) return;
          if (loc.start.cfi) stockage.set(CLE_POS + livre.id, loc.start.cfi);
          // Progression par index de CHAPITRE (spine) : instantané, sans
          // générer toutes les positions du livre (ce qui bloquait le fil
          // principal et provoquait des à-coups au changement de chapitre).
          try {
            const idx = typeof loc.start.index === "number" ? loc.start.index : 0;
            if (totalSpine > 1) {
              const pct = Math.round((idx / (totalSpine - 1)) * 100);
              setProgress(pct);
              // Remonte la progression à l'app (historique / statut lu), en
              // limitant les écritures : seulement quand le % bouge nettement
              // ou atteint la fin.
              if (
                onProgressRef.current &&
                (Math.abs(pct - dernierPct.current) >= 2 || pct >= 99)
              ) {
                dernierPct.current = pct;
                onProgressRef.current(pct);
              }
            }
          } catch (e) {
            /* ignore */
          }
        });

        // Sommaire (chapitres)
        book.loaded.navigation
          .then((nav) => {
            if (!annule && nav && Array.isArray(nav.toc)) setToc(nav.toc);
          })
          .catch(() => {});

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
      stockage.set(CLE_FONT, String(nf));
      if (renditionRef.current) renditionRef.current.themes.fontSize(nf + "%");
      return nf;
    });
  }
  function changerTheme() {
    setTheme((t) => {
      const nt = ORDRE_THEME[(ORDRE_THEME.indexOf(t) + 1) % ORDRE_THEME.length];
      stockage.set(CLE_THEME, nt);
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
              {onTermine ? (
                <button
                  onClick={onTermine}
                  aria-label="Marquer ce livre comme terminé"
                  title="J'ai terminé ce livre"
                >
                  ✓
                </button>
              ) : null}
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
