import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { LIVRES } from "./data/livres.js";
import { piocherPoolFr } from "./api/gutendex.js";

// Chargé à la demande : epub.js + jszip (~500 Ko) ne pèsent plus sur
// l'écran de découverte, seulement à l'ouverture d'un livre.
const Reader = lazy(() => import("./components/Reader.jsx"));

/* ------------------------------------------------------------------ */
/*  Persistance localStorage (toujours protégée par try/catch)         */
/* ------------------------------------------------------------------ */
const CLE_BIBLIO = "tranche.biblio";
const CLE_CADENCE = "tranche.cadence";
const CLE_DUEL = "tranche.duel";
const CLE_CATEGORIE = "tranche.categorie";

// Catégories proposées. On garde le principe « on ne choisit pas les 2 livres »,
// mais on peut choisir DANS QUOI on pioche pour éviter les paires bancales
// (ex. une bio + un essai). `topic` filtre côté Gutendex ; `genres` affine
// localement (doit correspondre aux libellés produits par genreDepuis).
const CATEGORIES = [
  { id: "tout", label: "Au hasard", phrase: "au hasard", topic: null, genres: null },
  { id: "roman", label: "Romans", phrase: "des romans", topic: "fiction", genres: ["Roman"] },
  { id: "nouvelle", label: "Nouvelles", phrase: "des nouvelles", topic: "short stories", genres: ["Nouvelles"] },
  { id: "conte", label: "Contes", phrase: "des contes", topic: "fairy tales", genres: ["Conte"] },
  { id: "aventure", label: "Aventure", phrase: "de l'aventure", topic: "adventure", genres: ["Aventure"] },
  { id: "policier", label: "Policier", phrase: "du policier", topic: "detective", genres: ["Policier"] },
  { id: "poesie", label: "Poésie", phrase: "de la poésie", topic: "poetry", genres: ["Poésie"] },
  { id: "theatre", label: "Théâtre", phrase: "du théâtre", topic: "drama", genres: ["Théâtre"] },
  { id: "essai", label: "Essais", phrase: "des essais", topic: "essays", genres: ["Essai"] },
  { id: "biographie", label: "Biographies", phrase: "des biographies", topic: "biography", genres: ["Biographie"] },
];

function lire(cle, defaut) {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? JSON.parse(brut) : defaut;
  } catch (e) {
    return defaut;
  }
}

function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch (e) {
    /* stockage indisponible : on ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Duel : stable par période (jour / semaine / mois)                  */
/* ------------------------------------------------------------------ */

// Clé de période : change à chaque nouvelle journée / semaine / mois.
function clePeriode(cadence) {
  const d = new Date();
  const an = d.getFullYear();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");

  if (cadence === "mois") return `${an}-${mois}`;

  if (cadence === "semaine") {
    const date = new Date(Date.UTC(an, d.getMonth(), d.getDate()));
    const numJour = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - numJour);
    const debutAnnee = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const semaine = Math.ceil(((date - debutAnnee) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-S${String(semaine).padStart(2, "0")}`;
  }

  return `${an}-${mois}-${jour}`;
}

// Hash déterministe (même clé -> même graine -> même duel).
function graineDepuis(texte) {
  let h = 0;
  for (let i = 0; i < texte.length; i++) h = (h * 31 + texte.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Tire DEUX livres d'un pool, en contrastant les genres si possible.
function tirerPaire(pool, graine) {
  const n = pool.length;
  if (n === 0) return [];
  if (n === 1) return [pool[0]];

  const i1 = graine % n;
  const premier = pool[i1];

  let diffGenre = null;
  let diffAuteur = null;
  let autre = null;
  for (let k = 1; k < n; k++) {
    const idx = (i1 + graine + k) % n;
    if (idx === i1) continue;
    const candidat = pool[idx];
    if (!autre) autre = candidat;
    if (!diffAuteur && candidat.auteur !== premier.auteur) diffAuteur = candidat;
    if (candidat.genre !== premier.genre) {
      diffGenre = candidat; // genre différent : idéal (mode « au hasard »)
      break;
    }
  }

  // À défaut de genre différent (même catégorie), au moins un auteur différent.
  const second = diffGenre || diffAuteur || autre || pool[(i1 + 1) % n];
  return [premier, second];
}

/* ------------------------------------------------------------------ */
/*  Migration de la bibliothèque (ancien format {id} -> objet complet) */
/* ------------------------------------------------------------------ */
function migrerBiblio(brut) {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((e) => {
      if (e && e.livre) return e; // déjà au bon format
      if (e && e.id) {
        const seed = LIVRES.find((l) => l.id === e.id);
        if (seed) {
          return { livre: seed, etoiles: e.etoiles || 0, carnet: e.carnet || "" };
        }
      }
      return null;
    })
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  Couverture typographique (pas d'image)                             */
/* ------------------------------------------------------------------ */
function Couverture({ livre }) {
  // Vraie couverture Gutenberg si disponible ; sinon couverture typographique.
  if (livre.couvertureUrl) {
    return (
      <div className="tr-couv tr-couv-img">
        <img
          src={livre.couvertureUrl}
          alt={`Couverture de « ${livre.titre} »`}
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <div className="tr-couv" style={{ background: livre.couleur }}>
      <span className="tr-couv-genre">{livre.genre}</span>
      <div className="tr-couv-centre">
        <h2 className="tr-couv-titre">{livre.titre}</h2>
        <span className="tr-couv-trait" />
        <span className="tr-couv-auteur">{livre.auteur}</span>
      </div>
      <span className="tr-couv-annee">{livre.annee || livre.epoque || ""}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Carte de découverte                                                */
/* ------------------------------------------------------------------ */
function Carte({ livre, garde, onGarder, onLire }) {
  const dateLabel = livre.annee ? "Année" : "Époque";
  const dateValeur = livre.annee || livre.epoque || "—";
  return (
    <article className="tr-carte">
      <Couverture livre={livre} />
      <div className="tr-fiche">
        {livre.couvertureUrl ? (
          <h2 className="tr-fiche-titre">{livre.titre}</h2>
        ) : null}
        <dl className="tr-meta">
          <div>
            <dt className="tr-label">Auteur</dt>
            <dd>{livre.auteur}</dd>
          </div>
          <div>
            <dt className="tr-label">{dateLabel}</dt>
            <dd>{dateValeur}</dd>
          </div>
          <div>
            <dt className="tr-label">Genre</dt>
            <dd>{livre.genre}</dd>
          </div>
        </dl>
        <p className="tr-resume">{livre.resume}</p>
        <div className="tr-actions">
          <button
            className={"tr-btn" + (garde ? " tr-btn-actif" : "")}
            onClick={onGarder}
            disabled={garde}
          >
            {garde ? "♥ Gardé" : "♥ Garder"}
          </button>
          <button className="tr-btn tr-btn-plein" onClick={onLire}>
            Lire →
          </button>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  Carrousel 2 cartes : une à la fois, on balaie pour voir l'autre    */
/* ------------------------------------------------------------------ */
function Carrousel({ livres, estGarde, onGarder, onLire, actif = true }) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [enGlissement, setEnGlissement] = useState(false);
  const depart = useRef(null);
  const pisteRef = useRef(null);
  const nb = livres.length;

  useEffect(() => {
    if (index > nb - 1) setIndex(0);
  }, [nb, index]);

  function largeur() {
    return pisteRef.current ? pisteRef.current.offsetWidth : 1;
  }

  function onDown(e) {
    depart.current = { x: e.clientX, y: e.clientY, axe: null };
    setEnGlissement(true);
  }

  function onMove(e) {
    if (!depart.current) return;
    const dx = e.clientX - depart.current.x;
    const dy = e.clientY - depart.current.y;

    if (!depart.current.axe) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      depart.current.axe = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (depart.current.axe === "y") return;

    let delta = dx;
    if ((index === 0 && delta > 0) || (index === nb - 1 && delta < 0)) {
      delta *= 0.3;
    }
    setDrag(delta);
  }

  function terminer() {
    if (!depart.current) return;
    const seuil = 60;
    if (depart.current.axe === "x" && Math.abs(drag) > seuil) {
      if (drag < 0 && index < nb - 1) setIndex(index + 1);
      else if (drag > 0 && index > 0) setIndex(index - 1);
    }
    depart.current = null;
    setDrag(0);
    setEnGlissement(false);
  }

  useEffect(() => {
    if (!actif) return undefined; // inactif si un lecteur/modal est ouvert
    function onTouche(e) {
      const c = e.target;
      if (c && (c.tagName === "INPUT" || c.tagName === "TEXTAREA" || c.isContentEditable))
        return; // ne pas voler les flèches à un champ de saisie
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(nb - 1, i + 1));
    }
    window.addEventListener("keydown", onTouche);
    return () => window.removeEventListener("keydown", onTouche);
  }, [nb, actif]);

  const l = largeur();
  const pourcent = -index * 100;
  const dragPct = enGlissement && l ? (drag / l) * 100 : 0;

  return (
    <div className="tr-carrousel">
      <div
        className="tr-piste"
        ref={pisteRef}
        style={{
          transform: `translateX(calc(${pourcent}% + ${dragPct}%))`,
          transition: enGlissement ? "none" : "transform 0.32s ease",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={terminer}
        onPointerCancel={terminer}
        onPointerLeave={() => depart.current && terminer()}
      >
        {livres.map((livre) => (
          <div className="tr-slot" key={livre.id}>
            <Carte
              livre={livre}
              garde={estGarde(livre.id)}
              onGarder={() => onGarder(livre)}
              onLire={() => onLire(livre)}
            />
          </div>
        ))}
      </div>

      {/* Flèches cliquables : surtout utiles sur tablette/PC (pas de swipe souris) */}
      <button
        className="tr-fleche tr-fleche-g"
        onClick={() => setIndex((i) => Math.max(0, i - 1))}
        disabled={index === 0}
        aria-label="Livre précédent"
      >
        ‹
      </button>
      <button
        className="tr-fleche tr-fleche-d"
        onClick={() => setIndex((i) => Math.min(nb - 1, i + 1))}
        disabled={index === nb - 1}
        aria-label="Livre suivant"
      >
        ›
      </button>

      <div className="tr-points" aria-hidden="true">
        {livres.map((livre, i) => (
          <span
            key={livre.id}
            className={"tr-point" + (i === index ? " tr-point-actif" : "")}
          />
        ))}
      </div>
      <p className="tr-indice">← balaie pour voir l'autre →</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bibliothèque                                                       */
/* ------------------------------------------------------------------ */
function Etoiles({ note, onNoter }) {
  return (
    <div className="tr-etoiles" role="group" aria-label="Note">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={"tr-etoile" + (n <= note ? " tr-etoile-pleine" : "")}
          onClick={() => onNoter(n === note ? 0 : n)}
          aria-label={`Noter ${n} sur 5`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Bibliotheque({ entrees, onNoter, onCarnet, onRetirer, onLire }) {
  if (entrees.length === 0) {
    return (
      <div className="tr-vide">
        <p>Votre bibliothèque est vide.</p>
        <p className="tr-vide-sous">
          Gardez un livre depuis la Découverte pour le retrouver ici.
        </p>
      </div>
    );
  }
  return (
    <div className="tr-grille">
      {entrees.map((entree) => {
        const livre = entree.livre;
        if (!livre) return null;
        return (
          <div className="tr-item" key={livre.id}>
            <button
              className="tr-item-couv"
              onClick={() => onLire(livre)}
              aria-label={`Lire ${livre.titre}`}
            >
              <Couverture livre={livre} />
            </button>
            <Etoiles note={entree.etoiles} onNoter={(n) => onNoter(livre.id, n)} />
            {entree.carnet ? (
              <p className="tr-carnet-apercu">« {entree.carnet} »</p>
            ) : null}
            <div className="tr-item-actions">
              <button className="tr-lien" onClick={() => onCarnet(livre.id)}>
                carnet
              </button>
              <button className="tr-lien" onClick={() => onLire(livre)}>
                lire
              </button>
              <button
                className="tr-lien tr-lien-danger"
                onClick={() => onRetirer(livre.id)}
              >
                retirer
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Application                                                        */
/* ------------------------------------------------------------------ */
export default function App() {
  const [vue, setVue] = useState("decouverte");
  const [cadence, setCadence] = useState(() => lire(CLE_CADENCE, "jour"));
  const [categorie, setCategorie] = useState(() => lire(CLE_CATEGORIE, "tout"));
  const [biblio, setBiblio] = useState(() => migrerBiblio(lire(CLE_BIBLIO, [])));
  const [duel, setDuel] = useState([]);
  const [statut, setStatut] = useState("chargement"); // chargement | ok | hors-ligne
  const [lecture, setLecture] = useState(null);
  const [carnetPour, setCarnetPour] = useState(null);
  const [brouillon, setBrouillon] = useState("");
  const [toast, setToast] = useState("");
  const toastRef = useRef(null);

  useEffect(() => ecrire(CLE_BIBLIO, biblio), [biblio]);
  useEffect(() => ecrire(CLE_CADENCE, cadence), [cadence]);
  useEffect(() => ecrire(CLE_CATEGORIE, categorie), [categorie]);

  // Duel de la période : réutilisé tant que la clé ne change pas,
  // sinon on pioche un nouveau pool dans la bibliothèque française.
  useEffect(() => {
    let annule = false;
    const ctrl = new AbortController();
    const cat = CATEGORIES.find((c) => c.id === categorie) || CATEGORIES[0];

    async function majDuel() {
      const cle = clePeriode(cadence);
      const memo = lire(CLE_DUEL, null);
      if (
        memo &&
        memo.cle === cle &&
        memo.cadence === cadence &&
        memo.categorie === categorie &&
        Array.isArray(memo.livres) &&
        memo.livres.length >= 2
      ) {
        setDuel(memo.livres);
        setStatut("ok");
        return;
      }

      setStatut("chargement");
      let pool = [];
      try {
        pool = await piocherPoolFr({ pages: 2, topic: cat.topic, signal: ctrl.signal });
      } catch (e) {
        pool = [];
      }
      if (annule) return;

      // Affine à la catégorie si on a assez de livres correspondants,
      // sinon on garde le pool (déjà biaisé par le topic) tel quel.
      if (cat.genres) {
        const dans = pool.filter((l) => cat.genres.includes(l.genre));
        if (dans.length >= 2) pool = dans;
      }

      let horsLigne = false;
      if (pool.length < 2) {
        // Repli hors-ligne : catalogue curé, filtré par catégorie si possible.
        let seed = LIVRES;
        if (cat.genres) {
          const s = LIVRES.filter((l) => cat.genres.includes(l.genre));
          if (s.length >= 2) seed = s;
        }
        pool = seed;
        horsLigne = true;
      }

      const paire = tirerPaire(pool, graineDepuis(categorie + ":" + cadence + ":" + cle));
      if (annule) return;
      ecrire(CLE_DUEL, { cle, cadence, categorie, livres: paire });
      setDuel(paire);
      setStatut(horsLigne ? "hors-ligne" : "ok");
    }

    majDuel();
    return () => {
      annule = true;
      ctrl.abort();
    };
  }, [cadence, categorie]);

  function afficherToast(message) {
    setToast(message);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 2200);
  }

  const estGarde = (id) => biblio.some((e) => e.livre && e.livre.id === id);

  function garder(livre) {
    if (estGarde(livre.id)) return;
    setBiblio((b) => [...b, { livre, etoiles: 0, carnet: "" }]);
    afficherToast("Ajouté à la bibliothèque");
  }

  function retirer(id) {
    setBiblio((b) => b.filter((e) => e.livre.id !== id));
    afficherToast("Retiré");
  }

  function noter(id, n) {
    setBiblio((b) =>
      b.map((e) => (e.livre.id === id ? { ...e, etoiles: n } : e))
    );
  }

  function ouvrirCarnet(id) {
    const entree = biblio.find((e) => e.livre.id === id);
    setBrouillon(entree ? entree.carnet : "");
    setCarnetPour(id);
  }

  function enregistrerCarnet() {
    const texte = brouillon.trim();
    setBiblio((b) =>
      b.map((e) => (e.livre.id === carnetPour ? { ...e, carnet: texte } : e))
    );
    setCarnetPour(null);
    setBrouillon("");
    afficherToast("Carnet enregistré");
  }

  const entreeCarnet = carnetPour
    ? biblio.find((e) => e.livre.id === carnetPour)
    : null;

  return (
    <div className="tr-root">
      <header className="tr-entete">
        <div className="tr-marque">
          <span className="tr-logo">Tranche</span>
          <span className="tr-baseline">deux livres, une période</span>
        </div>
        <nav className="tr-nav">
          <button
            className={"tr-onglet" + (vue === "decouverte" ? " tr-onglet-actif" : "")}
            onClick={() => setVue("decouverte")}
          >
            Découverte
          </button>
          <button
            className={"tr-onglet" + (vue === "biblio" ? " tr-onglet-actif" : "")}
            onClick={() => setVue("biblio")}
          >
            Bibliothèque
            {biblio.length > 0 ? (
              <span className="tr-badge">{biblio.length}</span>
            ) : null}
          </button>
        </nav>
      </header>

      <main className="tr-main">
        {vue === "decouverte" && (
          <section className="tr-decouverte">
            <p className="tr-phrase">
              Fais-moi découvrir un livre{" "}
              <select
                className="tr-select"
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                aria-label="Fréquence de découverte"
              >
                <option value="jour">chaque jour</option>
                <option value="semaine">chaque semaine</option>
                <option value="mois">chaque mois</option>
              </select>
              , plutôt{" "}
              <select
                className="tr-select"
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                aria-label="Genre à découvrir"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.phrase}
                  </option>
                ))}
              </select>
              .
            </p>

            {statut === "hors-ligne" ? (
              <p className="tr-note-reseau">
                Hors ligne — sélection de secours. Reconnecte-toi pour découvrir
                toute la bibliothèque.
              </p>
            ) : null}

            {statut === "chargement" && duel.length < 2 ? (
              <div className="tr-chargement">
                <span className="tr-reader-spin" />
                <p>On pioche deux livres…</p>
              </div>
            ) : duel.length >= 2 ? (
              <Carrousel
                livres={duel}
                estGarde={estGarde}
                onGarder={garder}
                onLire={setLecture}
                actif={!lecture && !carnetPour}
              />
            ) : (
              <p className="tr-vide">Aucun duel disponible.</p>
            )}
          </section>
        )}

        {vue === "biblio" && (
          <section className="tr-biblio">
            <Bibliotheque
              entrees={biblio}
              onNoter={noter}
              onCarnet={ouvrirCarnet}
              onRetirer={retirer}
              onLire={setLecture}
            />
          </section>
        )}
      </main>

      {lecture && (
        <Suspense
          fallback={
            <div className="tr-reader">
              <div className="tr-reader-overlay">
                <span className="tr-reader-spin" />
                <p>Ouverture du lecteur…</p>
              </div>
            </div>
          }
        >
          <Reader livre={lecture} onFermer={() => setLecture(null)} />
        </Suspense>
      )}

      {carnetPour && (
        <div className="tr-modal-fond" onClick={() => setCarnetPour(null)}>
          <div className="tr-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="tr-modal-titre">
              Carnet — {entreeCarnet ? entreeCarnet.livre.titre : ""}
            </h3>
            <p className="tr-modal-aide">Une phrase, une impression.</p>
            <textarea
              className="tr-textarea"
              value={brouillon}
              onChange={(e) => setBrouillon(e.target.value)}
              placeholder="Ce que ce livre a laissé…"
              rows={4}
              autoFocus
            />
            <div className="tr-modal-actions">
              <button className="tr-btn" onClick={() => setCarnetPour(null)}>
                Annuler
              </button>
              <button className="tr-btn tr-btn-plein" onClick={enregistrerCarnet}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {toast ? <div className="tr-toast">{toast}</div> : null}
    </div>
  );
}
