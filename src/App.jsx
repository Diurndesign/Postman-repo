import React, { useEffect, useRef, useState } from "react";
import { LIVRES } from "./data/livres.js";
import Reader from "./components/Reader.jsx";

/* ------------------------------------------------------------------ */
/*  Persistance localStorage (toujours protégée par try/catch)         */
/* ------------------------------------------------------------------ */
const CLE_BIBLIO = "tranche.biblio";
const CLE_CADENCE = "tranche.cadence";
const CLE_DUEL = "tranche.duel";

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
/*  Duel du jour : stable par période (jour / semaine / mois)          */
/* ------------------------------------------------------------------ */

// Clé de période : change à chaque nouvelle journée / semaine / mois.
function clePeriode(cadence) {
  const d = new Date();
  const an = d.getFullYear();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");

  if (cadence === "mois") return `${an}-${mois}`;

  if (cadence === "semaine") {
    // Numéro de semaine ISO 8601.
    const date = new Date(Date.UTC(an, d.getMonth(), d.getDate()));
    const numJour = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - numJour);
    const debutAnnee = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const semaine = Math.ceil(((date - debutAnnee) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-S${String(semaine).padStart(2, "0")}`;
  }

  return `${an}-${mois}-${jour}`; // par défaut : le jour
}

// Petit hash déterministe : même clé -> même graine -> même duel.
function graineDepuis(texte) {
  let h = 0;
  for (let i = 0; i < texte.length; i++) {
    h = (h * 31 + texte.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Tire DEUX livres, en contrastant les genres si possible. Déterministe.
function tirerPaire(livres, graine) {
  const n = livres.length;
  const i1 = graine % n;
  const premier = livres[i1];

  let second = null;
  for (let k = 1; k < n; k++) {
    const idx = (i1 + graine + k) % n;
    if (idx === i1) continue;
    const candidat = livres[idx];
    if (candidat.genre !== premier.genre) {
      second = candidat; // genre différent : idéal
      break;
    }
    if (!second) second = candidat; // repli : au moins un autre livre
  }
  if (!second) second = livres[(i1 + 1) % n];

  return [premier.id, second.id];
}

// Renvoie le duel courant, en le régénérant seulement quand la clé change.
function duelCourant(cadence) {
  const cle = clePeriode(cadence);
  const memo = lire(CLE_DUEL, null);
  if (
    memo &&
    memo.cle === cle &&
    memo.cadence === cadence &&
    Array.isArray(memo.ids) &&
    memo.ids.length === 2
  ) {
    return memo.ids;
  }
  const ids = tirerPaire(LIVRES, graineDepuis(cadence + ":" + cle));
  ecrire(CLE_DUEL, { cle, cadence, ids });
  return ids;
}

function parId(id) {
  return LIVRES.find((l) => l.id === id) || null;
}

/* ------------------------------------------------------------------ */
/*  Couverture typographique (pas d'image)                             */
/* ------------------------------------------------------------------ */
function Couverture({ livre }) {
  return (
    <div className="tr-couv" style={{ background: livre.couleur }}>
      <span className="tr-couv-genre">{livre.genre}</span>
      <div className="tr-couv-centre">
        <h2 className="tr-couv-titre">{livre.titre}</h2>
        <span className="tr-couv-trait" />
        <span className="tr-couv-auteur">{livre.auteur}</span>
      </div>
      <span className="tr-couv-annee">{livre.annee}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Carte de découverte                                                */
/* ------------------------------------------------------------------ */
function Carte({ livre, garde, onGarder, onLire }) {
  return (
    <article className="tr-carte">
      <Couverture livre={livre} />
      <div className="tr-fiche">
        <dl className="tr-meta">
          <div>
            <dt className="tr-label">Auteur</dt>
            <dd>{livre.auteur}</dd>
          </div>
          <div>
            <dt className="tr-label">Année</dt>
            <dd>{livre.annee}</dd>
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
function Carrousel({ livres, estGarde, onGarder, onLire }) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0); // décalage horizontal courant (px)
  const [enGlissement, setEnGlissement] = useState(false);
  const depart = useRef(null); // { x, y, axe: null|'x'|'y' }
  const pisteRef = useRef(null);
  const nb = livres.length;

  // Reste dans les bornes si la paire change.
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

    // Verrouillage d'axe : on décide horizontal ou vertical au premier geste.
    if (!depart.current.axe) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      depart.current.axe = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (depart.current.axe === "y") return; // on laisse le scroll vertical

    let delta = dx;
    // Résistance élastique aux bords (pas de boucle infinie).
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

  // Flèches clavier ← →
  useEffect(() => {
    function onTouche(e) {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(nb - 1, i + 1));
    }
    window.addEventListener("keydown", onTouche);
    return () => window.removeEventListener("keydown", onTouche);
  }, [nb]);

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
        const livre = parId(entree.id);
        if (!livre) return null;
        return (
          <div className="tr-item" key={entree.id}>
            <button
              className="tr-item-couv"
              onClick={() => onLire(livre)}
              aria-label={`Lire ${livre.titre}`}
            >
              <Couverture livre={livre} />
            </button>
            <Etoiles note={entree.etoiles} onNoter={(n) => onNoter(entree.id, n)} />
            {entree.carnet ? (
              <p className="tr-carnet-apercu">« {entree.carnet} »</p>
            ) : null}
            <div className="tr-item-actions">
              <button className="tr-lien" onClick={() => onCarnet(entree.id)}>
                carnet
              </button>
              <button className="tr-lien" onClick={() => onLire(livre)}>
                lire
              </button>
              <button
                className="tr-lien tr-lien-danger"
                onClick={() => onRetirer(entree.id)}
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
  const [vue, setVue] = useState("decouverte"); // decouverte | biblio
  const [cadence, setCadence] = useState(() => lire(CLE_CADENCE, "jour"));
  const [biblio, setBiblio] = useState(() => lire(CLE_BIBLIO, []));
  const [duel, setDuel] = useState(() => duelCourant(lire(CLE_CADENCE, "jour")));
  const [lecture, setLecture] = useState(null); // livre en cours de lecture
  const [carnetPour, setCarnetPour] = useState(null); // id ou null
  const [brouillon, setBrouillon] = useState("");
  const [toast, setToast] = useState("");
  const toastRef = useRef(null);

  // Écritures localStorage à chaque changement.
  useEffect(() => ecrire(CLE_BIBLIO, biblio), [biblio]);
  useEffect(() => ecrire(CLE_CADENCE, cadence), [cadence]);

  // Recalcule le duel quand la cadence (ou la période) change.
  useEffect(() => {
    setDuel(duelCourant(cadence));
  }, [cadence]);

  function afficherToast(message) {
    setToast(message);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 2200);
  }

  const estGarde = (id) => biblio.some((e) => e.id === id);

  function garder(livre) {
    if (estGarde(livre.id)) return;
    setBiblio((b) => [...b, { id: livre.id, etoiles: 0, carnet: "" }]);
    afficherToast("Ajouté à la bibliothèque");
  }

  function retirer(id) {
    setBiblio((b) => b.filter((e) => e.id !== id));
    afficherToast("Retiré");
  }

  function noter(id, n) {
    setBiblio((b) => b.map((e) => (e.id === id ? { ...e, etoiles: n } : e)));
  }

  function ouvrirCarnet(id) {
    const entree = biblio.find((e) => e.id === id);
    setBrouillon(entree ? entree.carnet : "");
    setCarnetPour(id);
  }

  function enregistrerCarnet() {
    const texte = brouillon.trim();
    setBiblio((b) =>
      b.map((e) => (e.id === carnetPour ? { ...e, carnet: texte } : e))
    );
    setCarnetPour(null);
    setBrouillon("");
    afficherToast("Carnet enregistré");
  }

  const livresDuel = duel.map(parId).filter(Boolean);
  const livreCarnet = carnetPour ? parId(carnetPour) : null;

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
            <div className="tr-cadences">
              {[
                ["jour", "Chaque jour"],
                ["semaine", "Chaque semaine"],
                ["mois", "Chaque mois"],
              ].map(([val, texte]) => (
                <button
                  key={val}
                  className={"tr-chip" + (cadence === val ? " tr-chip-actif" : "")}
                  onClick={() => setCadence(val)}
                >
                  {texte}
                </button>
              ))}
            </div>

            {livresDuel.length === 2 ? (
              <Carrousel
                livres={livresDuel}
                estGarde={estGarde}
                onGarder={garder}
                onLire={setLecture}
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

      {/* Lecteur plein écran */}
      {lecture && <Reader livre={lecture} onFermer={() => setLecture(null)} />}

      {/* Modal carnet */}
      {carnetPour && (
        <div className="tr-modal-fond" onClick={() => setCarnetPour(null)}>
          <div className="tr-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="tr-modal-titre">
              Carnet — {livreCarnet ? livreCarnet.titre : ""}
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

      {/* Toast */}
      {toast ? <div className="tr-toast">{toast}</div> : null}
    </div>
  );
}
