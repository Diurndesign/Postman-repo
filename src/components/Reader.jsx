import React, { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import { resoudreEpub, urlLecture } from "../api/gutendex.js";

// Lecteur plein écran. Résout l'epub via Gutendex, le rend avec epub.js,
// et retombe sur l'incipit en cas d'échec.
export default function Reader({ livre, onFermer }) {
  const viewerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const [etat, setEtat] = useState("chargement"); // chargement | ok | erreur

  useEffect(() => {
    let annule = false;

    async function charger() {
      setEtat("chargement");
      try {
        const brut = await resoudreEpub(livre);
        if (!brut) throw new Error("epub introuvable");
        if (annule) return;

        const url = urlLecture(brut);
        const book = ePub(url);
        bookRef.current = book;

        const rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "none",
        });
        renditionRef.current = rendition;

        await rendition.display();
        if (annule) return;
        setEtat("ok");
      } catch (e) {
        if (!annule) setEtat("erreur");
      }
    }

    charger();

    // Nettoyage au démontage : on détruit rendition et livre.
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
        {/* La cible du rendu epub.js. Toujours présente dans le DOM. */}
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
            <p className="tr-reader-incipit">« {livre.incipit} »</p>
            <p className="tr-reader-sign">— début de « {livre.titre} »</p>
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
