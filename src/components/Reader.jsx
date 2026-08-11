import React, { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import {
  resoudreEpub,
  urlLecture,
  chargerIncipit,
} from "../api/gutendex.js";
import { estNatif, telechargerEpubBuffer } from "../native.js";

// Mémorisation de la position de lecture (CFI epub) par livre.
const CLE_POS = "tranche.pos.";
function lirePos(id) {
  try {
    return localStorage.getItem(CLE_POS + id) || null;
  } catch (e) {
    return null;
  }
}
function ecrirePos(id, cfi) {
  try {
    localStorage.setItem(CLE_POS + id, cfi);
  } catch (e) {
    /* ignore */
  }
}

// Lecteur plein écran. L'URL epub vient directement de la fiche Gutendex
// (livre.epubUrl) ; pour les 12 livres seed on la résout par recherche.
export default function Reader({ livre, onFermer }) {
  const viewerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const [etat, setEtat] = useState("chargement"); // chargement | ok | erreur
  const [incipit, setIncipit] = useState(livre.incipit || "");

  useEffect(() => {
    let annule = false;

    async function charger() {
      setEtat("chargement");
      try {
        let brut = livre.epubUrl;
        if (!brut) brut = await resoudreEpub(livre); // repli pour les seeds
        if (!brut) throw new Error("epub introuvable");
        if (annule) return;

        // Web : on passe par le proxy /gutenberg (CORS).
        // Natif (Android/iOS) : pas de proxy → on télécharge l'epub en
        // ArrayBuffer via la couche native et on le lit localement.
        let source;
        if (estNatif()) {
          source = await telechargerEpubBuffer(brut);
        } else {
          source = urlLecture(brut);
        }
        if (annule) return;

        const book = ePub(source);
        bookRef.current = book;

        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "none",
        });
        renditionRef.current = rendition;

        // Reprise à la dernière position connue, sinon au début.
        const pos = lirePos(livre.id);
        await rendition.display(pos || undefined);
        if (annule) return;

        // Mémorise la position à chaque changement de page.
        rendition.on("relocated", (loc) => {
          if (loc && loc.start && loc.start.cfi) ecrirePos(livre.id, loc.start.cfi);
        });

        setEtat("ok");
      } catch (e) {
        if (annule) return;
        // Repli : on tente de récupérer l'incipit si on ne l'a pas déjà.
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

  function precedent() {
    if (renditionRef.current) renditionRef.current.prev();
  }
  function suivant() {
    if (renditionRef.current) renditionRef.current.next();
  }

  return (
    <div className="tr-reader">
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
        <footer className="tr-reader-nav">
          <button onClick={precedent} aria-label="Page précédente">
            ← Page
          </button>
          <button onClick={suivant} aria-label="Page suivante">
            Page →
          </button>
        </footer>
      )}
    </div>
  );
}
