import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { LIVRES } from "./data/livres.js";
import {
  piocherPoolFr,
  pageCatalogue,
  chargerIncipit,
  cleOeuvre,
} from "./api/gutendex.js";

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
// Incrémenter invalide les duels mis en cache (nouveaux champs : résumé FR,
// couverture Gutenberg…), pour qu'ils soient re-tirés avec les données à jour.
const VERSION_DONNEES = 3;

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

function Favoris({ entrees, onNoter, onCarnet, onRetirer, onLire }) {
  if (entrees.length === 0) {
    return (
      <div className="tr-vide">
        <p>Aucun favori pour l'instant.</p>
        <p className="tr-vide-sous">
          Gardez un livre depuis la Découverte ou la Bibliothèque, notez-le et
          écrivez ce que vous en avez pensé.
        </p>
      </div>
    );
  }
  return (
    <div className="tr-favoris">
      {entrees.map((entree) => {
        const livre = entree.livre;
        if (!livre) return null;
        return (
          <article className="tr-favori" key={livre.id}>
            <button
              className="tr-favori-couv"
              onClick={() => onLire(livre)}
              aria-label={`Lire ${livre.titre}`}
            >
              <Couverture livre={livre} />
            </button>
            <div className="tr-favori-corps">
              <h3 className="tr-favori-titre">{livre.titre}</h3>
              <p className="tr-favori-auteur">{livre.auteur}</p>
              <Etoiles note={entree.etoiles} onNoter={(n) => onNoter(livre.id, n)} />

              {entree.carnet ? (
                <button
                  className="tr-note-card"
                  onClick={() => onCarnet(livre.id)}
                  title="Modifier la note"
                >
                  <span className="tr-note-label">Ce que j'en ai aimé</span>
                  <span className="tr-note-texte">« {entree.carnet} »</span>
                </button>
              ) : (
                <button
                  className="tr-note-vide"
                  onClick={() => onCarnet(livre.id)}
                >
                  + écrire une note
                </button>
              )}

              <div className="tr-favori-actions">
                <button className="tr-lien" onClick={() => onLire(livre)}>
                  lire
                </button>
                <button className="tr-lien" onClick={() => onCarnet(livre.id)}>
                  {entree.carnet ? "modifier la note" : "note"}
                </button>
                <button
                  className="tr-lien tr-lien-danger"
                  onClick={() => onRetirer(livre.id)}
                >
                  retirer
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bibliothèque : parcourir tout le catalogue FR                      */
/* ------------------------------------------------------------------ */
function Catalogue({ estGarde, onGarder, onRetirer, onLire }) {
  const [saisie, setSaisie] = useState("");
  const [requete, setRequete] = useState("");
  const [genre, setGenre] = useState("tout");
  const [livres, setLivres] = useState([]);
  const [page, setPage] = useState(1);
  const [suivant, setSuivant] = useState(false);
  const [statut, setStatut] = useState("chargement"); // chargement | ok | vide | hors-ligne
  const [plusEnCours, setPlusEnCours] = useState(false);
  const vus = useRef(new Set());
  const cat = CATEGORIES.find((c) => c.id === genre) || CATEGORIES[0];

  useEffect(() => {
    let annule = false;
    const ctrl = new AbortController();

    async function charger() {
      if (page === 1) setStatut("chargement");
      else setPlusEnCours(true);
      try {
        const r = await pageCatalogue({
          search: requete || null,
          topic: cat.topic,
          page,
          signal: ctrl.signal,
        });
        if (annule) return;
        setSuivant(r.suivant);
        setLivres((prev) => {
          if (page === 1) vus.current = new Set();
          const base = page === 1 ? [] : prev;
          const out = base.slice();
          for (const l of r.livres) {
            // Déduplication par œuvre (titre + auteur) : Gutenberg a souvent
            // plusieurs éditions d'un même livre → on n'en garde qu'une.
            const k = cleOeuvre(l);
            if (vus.current.has(k)) continue;
            vus.current.add(k);
            out.push(l);
          }
          return out;
        });
        setStatut((s) => (page === 1 && r.livres.length === 0 ? "vide" : "ok"));
      } catch (e) {
        if (annule) return;
        if (page === 1) {
          setLivres(LIVRES);
          setStatut("hors-ligne");
        }
      } finally {
        if (!annule) setPlusEnCours(false);
      }
    }

    charger();
    return () => {
      annule = true;
      ctrl.abort();
    };
  }, [requete, genre, page]);

  function lancer(e) {
    e.preventDefault();
    setPage(1);
    setRequete(saisie.trim());
  }

  function choisirGenre(id) {
    setPage(1);
    setGenre(id);
  }

  return (
    <div className="tr-catalogue">
      <form className="tr-recherche" onSubmit={lancer}>
        <input
          type="search"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Chercher un titre, un auteur…"
          aria-label="Rechercher un livre"
        />
        <button type="submit" className="tr-btn tr-btn-plein">
          Chercher
        </button>
      </form>

      <div className="tr-filtres" role="group" aria-label="Filtrer par genre">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={"tr-chip tr-chip-cat" + (genre === c.id ? " tr-chip-actif" : "")}
            onClick={() => choisirGenre(c.id)}
          >
            {c.id === "tout" ? "Tous" : c.label}
          </button>
        ))}
      </div>

      {statut === "hors-ligne" && (
        <p className="tr-note-reseau">
          Hors ligne — aperçu du catalogue. Reconnecte-toi pour tout parcourir.
        </p>
      )}

      {statut === "chargement" ? (
        <div className="tr-chargement">
          <span className="tr-reader-spin" />
          <p>Chargement du catalogue…</p>
        </div>
      ) : statut === "vide" ? (
        <p className="tr-vide">Aucun livre trouvé pour « {requete} ».</p>
      ) : (
        <>
          <div className="tr-grille">
            {livres.map((livre) => {
              const garde = estGarde(livre.id);
              return (
                <div className="tr-item" key={livre.id}>
                  <button
                    className="tr-item-couv"
                    onClick={() => onLire(livre)}
                    aria-label={`Lire ${livre.titre}`}
                  >
                    <Couverture livre={livre} />
                  </button>
                  <div className="tr-item-info">
                    <span className="tr-item-titre">{livre.titre}</span>
                    <span className="tr-item-auteur">{livre.auteur}</span>
                  </div>
                  <div className="tr-item-actions">
                    <button className="tr-lien" onClick={() => onLire(livre)}>
                      lire
                    </button>
                    <button
                      className={"tr-lien" + (garde ? " tr-lien-actif" : "")}
                      onClick={() =>
                        garde ? onRetirer(livre.id) : onGarder(livre)
                      }
                    >
                      {garde ? "★ favori" : "☆ favori"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {suivant && (
            <button
              className="tr-plus-btn"
              onClick={() => setPage((p) => p + 1)}
              disabled={plusEnCours}
            >
              {plusEnCours ? "Chargement…" : "Charger plus de livres"}
            </button>
          )}
        </>
      )}
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
        memo.v === VERSION_DONNEES &&
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

      // Enrichit le résumé avec la vraie première phrase (incipit) FR quand on
      // peut la récupérer ; sinon on garde la phrase générique par genre.
      await Promise.all(
        paire.map(async (livre) => {
          if (!livre || !livre.texteUrl || livre.incipit) return;
          try {
            const inc = await chargerIncipit(livre.texteUrl, ctrl.signal);
            if (inc) {
              livre.incipit = inc;
              livre.resume = inc;
            }
          } catch (e) {
            /* on garde le résumé générique */
          }
        })
      );
      if (annule) return;

      ecrire(CLE_DUEL, { v: VERSION_DONNEES, cle, cadence, categorie, livres: paire });
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
            className={"tr-onglet" + (vue === "catalogue" ? " tr-onglet-actif" : "")}
            onClick={() => setVue("catalogue")}
          >
            Bibliothèque
          </button>
          <button
            className={"tr-onglet" + (vue === "favoris" ? " tr-onglet-actif" : "")}
            onClick={() => setVue("favoris")}
            aria-label="Favoris"
          >
            <span className="tr-onglet-etoile">★</span>
            <span className="tr-onglet-mot">Favoris</span>
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

        {vue === "catalogue" && (
          <section className="tr-biblio">
            <Catalogue
              estGarde={estGarde}
              onGarder={garder}
              onRetirer={retirer}
              onLire={setLecture}
            />
          </section>
        )}

        {vue === "favoris" && (
          <section className="tr-biblio">
            <Favoris
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
