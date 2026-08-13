// Accès à l'API Gutendex (https://gutendex.com), l'index du Projet Gutenberg.
// On y pioche dans TOUT le corpus français du domaine public, et on enrichit
// chaque fiche automatiquement (genre déduit, couleur générée, résumé, incipit).
// Les 12 livres de data/livres.js ne servent plus que de filet hors-ligne.

const BASE = "https://gutendex.com/books";
const PAR_PAGE = 32; // taille de page fixe de Gutendex

/* ------------------------------------------------------------------ */
/*  Palette : mêmes teintes que le catalogue curé, pour rester sobre   */
/* ------------------------------------------------------------------ */
const PALETTE = [
  "#5A3E1B", "#7A2E2E", "#4A2E52", "#3B4A2F", "#2E3A4A", "#1B4A3A",
  "#2E4A52", "#5A5A1B", "#8A5A1B", "#52304A", "#3A5A4A", "#7A6A1B",
];

function hash(texte) {
  let h = 0;
  for (let i = 0; i < texte.length; i++) h = (h * 31 + texte.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function couleurPour(cle) {
  return PALETTE[hash(String(cle)) % PALETTE.length];
}

/* ------------------------------------------------------------------ */
/*  Normalisation d'un livre Gutendex vers notre forme interne         */
/* ------------------------------------------------------------------ */

// "Hugo, Victor" -> "Victor Hugo"
function nomAuteur(auteurs) {
  if (!auteurs || !auteurs.length) return "Auteur inconnu";
  const brut = auteurs[0].name || "";
  if (brut.includes(",")) {
    const [nom, prenom] = brut.split(",");
    return `${prenom.trim()} ${nom.trim()}`.trim();
  }
  return brut.trim();
}

// Époque affichable à partir des dates de l'auteur (l'année de l'œuvre
// n'est pas fournie par Gutendex).
function epoqueAuteur(auteurs) {
  if (!auteurs || !auteurs.length) return "";
  const a = auteurs[0];
  const n = a.birth_year;
  const m = a.death_year;
  if (n && m) return `${n}–${m}`;
  if (m) return `† ${m}`;
  if (n) return `${n}–`;
  return "";
}

// Genre déduit des rayons (bookshelves) et sujets (subjects) Gutenberg.
function genreDepuis(livre) {
  const texte = (
    (livre.bookshelves || []).join(" ") +
    " " +
    (livre.subjects || []).join(" ")
  ).toLowerCase();

  const regles = [
    ["science fiction", "Science-fiction"],
    ["fantasy", "Fantastique"],
    ["horror", "Fantastique"],
    ["adventure", "Aventure"],
    ["detective", "Policier"],
    ["mystery", "Policier"],
    ["crime", "Policier"],
    ["poetry", "Poésie"],
    ["poems", "Poésie"],
    ["drama", "Théâtre"],
    ["plays", "Théâtre"],
    ["short stories", "Nouvelles"],
    ["fairy tales", "Conte"],
    ["philosophy", "Essai"],
    ["essays", "Essai"],
    ["essay", "Essai"],
    ["history", "Histoire"],
    ["biography", "Biographie"],
    ["fiction", "Roman"],
  ];
  for (const [cle, label] of regles) {
    if (texte.includes(cle)) return label;
  }
  return "Littérature";
}

// Résumé EN FRANÇAIS. Gutendex ne fournit que des résumés anglais (Wikipédia
// EN) et des sujets anglais : on ne les affiche donc pas. À la place, une
// phrase française selon le genre, qui met en avant « domaine public / gratuit ».
const RESUME_FR = {
  Roman: "Un roman du domaine public, à lire librement et gratuitement.",
  Nouvelles: "Des nouvelles du domaine public, à savourer librement.",
  Conte: "Un conte du domaine public, à (re)découvrir gratuitement.",
  Aventure: "Un récit d'aventure du domaine public, libre et gratuit.",
  Policier: "Une intrigue du domaine public, à lire librement.",
  Poésie: "De la poésie du domaine public, à lire gratuitement.",
  Théâtre: "Une pièce du domaine public, à découvrir librement.",
  Essai: "Un essai du domaine public, à lire librement.",
  Biographie: "Un récit de vie du domaine public, libre et gratuit.",
  Histoire: "Un texte d'histoire du domaine public, à lire librement.",
  Fantastique: "Un récit fantastique du domaine public, à lire librement.",
  "Science-fiction": "Un récit d'anticipation du domaine public, libre et gratuit.",
  Littérature: "Un classique du domaine public, à lire librement et gratuitement.",
};
function resumeFr(genre) {
  return RESUME_FR[genre] || RESUME_FR["Littérature"];
}

function urlTexte(formats) {
  return (
    formats["text/plain; charset=utf-8"] ||
    formats["text/plain; charset=us-ascii"] ||
    formats["text/plain"] ||
    null
  );
}

// Transforme un livre Gutendex brut -> fiche interne, ou null si inexploitable.
export function normaliser(brut) {
  if (!brut) return null;
  const formats = brut.formats || {};
  const epub = formats["application/epub+zip"];
  if (!epub) return null; // sans epub, pas de lecture possible
  if (!brut.authors || !brut.authors.length) return null;

  const id = "gut-" + brut.id;
  const genre = genreDepuis(brut);
  return {
    id,
    gutenbergId: brut.id,
    titre: brut.title || "Sans titre",
    auteur: nomAuteur(brut.authors),
    annee: null, // année de l'œuvre non fournie par Gutendex
    epoque: epoqueAuteur(brut.authors),
    genre,
    couleur: couleurPour(id),
    couvertureUrl: formats["image/jpeg"] || null, // couverture Gutenberg
    telechargements: brut.download_count || 0, // popularité (départage les doublons)
    resume: resumeFr(genre),
    incipit: "", // chargé à la demande depuis le texte brut
    epubUrl: epub,
    texteUrl: urlTexte(formats),
    source: "gutendex",
  };
}

/* ------------------------------------------------------------------ */
/*  Filtrage : on écarte le bruit (sans auteur, sans sujet, non-texte) */
/* ------------------------------------------------------------------ */
function estExploitable(brut) {
  if (!brut) return false;
  if (brut.media_type && brut.media_type !== "Text") return false;
  const aSujets =
    (brut.subjects && brut.subjects.length) ||
    (brut.bookshelves && brut.bookshelves.length);
  return Boolean(aSujets);
}

/* ------------------------------------------------------------------ */
/*  Requêtes réseau (avec cache mémoire par session)                   */
/* ------------------------------------------------------------------ */
const _cacheJson = new Map(); // url -> { t, data }
const _TTL = 10 * 60 * 1000; // 10 min

async function fetchJson(url, signal) {
  const hit = _cacheJson.get(url);
  if (hit && Date.now() - hit.t < _TTL) return hit.data; // réponse instantanée
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const data = await r.json();
  _cacheJson.set(url, { t: Date.now(), data });
  return data;
}

// Clé de déduplication : même œuvre = même (titre + auteur) normalisés.
export function cleOeuvre(livre) {
  const sansAccents = /[̀-ͯ]/g; // marques diacritiques combinantes
  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(sansAccents, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return norm(livre.titre) + "|" + norm(livre.auteur);
}

// Une page de résultats FR, normalisée et filtrée.
// copyright=false : on ne garde que le vrai domaine public.
// topic : filtre par sujet/rayon Gutenberg (ex. "fiction", "poetry").
// search : recherche libre (titre / auteur).
export async function listerPageFr(page = 1, { topic = null, search = null, signal } = {}) {
  const t = topic ? `&topic=${encodeURIComponent(topic)}` : "";
  const s = search ? `&search=${encodeURIComponent(search)}` : "";
  const url = `${BASE}?languages=fr&copyright=false${t}${s}&page=${page}`;
  const data = await fetchJson(url, signal);
  const brut = Array.isArray(data.results) ? data.results : [];
  const livres = brut
    .filter(estExploitable)
    .map(normaliser)
    .filter(Boolean);
  return { count: data.count || 0, livres };
}

// Pioche un « pool » de découverte en tirant quelques pages au hasard.
// Renvoie un tableau de fiches internes (peut être vide si le réseau échoue).
export async function piocherPoolFr({ pages = 2, topic = null, signal } = {}) {
  // 1ʳᵉ page : sert aussi à connaître le nombre total de pages.
  const premiere = await listerPageFr(1, { topic, signal });
  const total = Math.max(1, Math.ceil((premiere.count || PAR_PAGE) / PAR_PAGE));

  const brut = [...premiere.livres];
  const dejaVues = new Set([1]);
  for (let i = 0; i < pages; i++) {
    const p = 1 + Math.floor(Math.random() * total);
    if (dejaVues.has(p)) continue;
    dejaVues.add(p);
    try {
      const page = await listerPageFr(p, { topic, signal });
      brut.push(...page.livres);
    } catch (e) {
      /* on ignore une page qui échoue */
    }
  }

  // Déduplication : une même œuvre (plusieurs éditions Gutenberg) ne doit
  // pas pouvoir apparaître deux fois dans le duel.
  const vues = new Set();
  const pool = [];
  for (const livre of brut) {
    const cle = cleOeuvre(livre);
    if (vues.has(cle)) continue;
    vues.add(cle);
    pool.push(livre);
  }
  return pool;
}

// Une page du catalogue pour la vue « Bibliothèque » (parcourir tout le
// corpus FR). `suivant` indique s'il reste des pages à charger.
export async function pageCatalogue({ search = null, topic = null, page = 1, signal } = {}) {
  const s = search ? `&search=${encodeURIComponent(search)}` : "";
  const t = topic ? `&topic=${encodeURIComponent(topic)}` : "";
  const url = `${BASE}?languages=fr&copyright=false${s}${t}&page=${page}`;
  const data = await fetchJson(url, signal);
  const brut = Array.isArray(data.results) ? data.results : [];
  // Filtre RELÂCHÉ pour le catalogue : on n'exige pas de « sujets » (ça
  // écartait trop de traductions françaises et cassait la recherche).
  // normaliser() garde déjà uniquement les livres avec epub + auteur.
  const livres = brut
    .filter((b) => !b.media_type || b.media_type === "Text")
    .map(normaliser)
    .filter(Boolean);
  return { livres, suivant: Boolean(data.next), count: data.count || 0 };
}

// Recherche par titre + auteur (repli pour les 12 livres seed, sans epub
// pré-résolu). Renvoie { id, epubUrl } pour permettre de construire les URLs
// DIRECTES du cache Gutenberg (lecture fiable), ou null.
export async function resoudreEpub({ titre, auteur }) {
  try {
    const requete = encodeURIComponent(titre + " " + auteur);
    const data = await fetchJson(
      `${BASE}?languages=fr&copyright=false&search=` + requete
    );
    const resultats = Array.isArray(data.results) ? data.results : [];
    for (const livre of resultats) {
      const epub = (livre.formats || {})["application/epub+zip"];
      if (epub) return { id: livre.id, epubUrl: epub };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// URLs epub à essayer pour la lecture, dans l'ordre. On privilégie les
// fichiers DIRECTS du cache Gutenberg (pas de redirection => pas de casse
// CORS via le proxy), et on retombe sur l'URL fournie par Gutendex.
export function urlsEpubCandidates(livre) {
  const urls = [];
  const id = livre.gutenbergId;
  if (id) {
    urls.push(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`);
    urls.push(`https://www.gutenberg.org/cache/epub/${id}/pg${id}-images-3.epub`);
  }
  if (livre.epubUrl) urls.push(livre.epubUrl);
  return urls;
}

/* ------------------------------------------------------------------ */
/*  Adaptation des URLs pour la lecture                                */
/* ------------------------------------------------------------------ */

// On passe toujours par le proxy /gutenberg pour éviter le CORS :
// - en dev, c'est le proxy de Vite (vite.config.js),
// - en production, c'est la réécriture Vercel (vercel.json).
export function urlLecture(url) {
  if (!url) return url;
  return url
    .replace(/^https:\/\/(www\.)?gutenberg\.org/, "/gutenberg")
    .replace(/^https:\/\/ws-export\.wmcloud\.org/, "/wsexport");
}

// Extrait la vraie première phrase (incipit) d'un texte brut Gutenberg.
// Best-effort : écarte l'en-tête, les titres/en-têtes en capitales, les
// « CHAPITRE / PARTIE / TABLE… », et renvoie "" si rien de convaincant.
export function extraireIncipit(texte) {
  if (!texte) return "";
  let corps = texte;
  const m = texte.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG/i);
  if (m !== -1) {
    const nl = texte.indexOf("\n", m);
    if (nl !== -1) corps = texte.slice(nl + 1);
  }
  const paras = corps
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const p of paras) {
    if (p.length < 60 || p.length > 500) continue;
    const lettres = p.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (lettres.length < 30) continue;
    if (!/[a-zà-ÿ]/.test(p)) continue; // pas que des capitales
    const majuscules = (p.match(/[A-ZÀ-Þ]/g) || []).length;
    if (majuscules / lettres.length > 0.55) continue; // titre en capitales
    if (!/[.!?…»]/.test(p)) continue; // doit contenir de la ponctuation
    if (
      /^(chapitre|partie|livre|tome|table|pr[eé]face|introduction|avant-propos|acte|scène|sommaire|notes?|d[eé]dicace)\b/i.test(
        p
      )
    )
      continue;
    const phrase = p.split(/(?<=[.!?…»])\s/)[0];
    const out = phrase && phrase.length >= 40 ? phrase : p;
    return out.slice(0, 320);
  }
  return "";
}

// Charge l'incipit depuis le texte brut, via une requête légère (Range).
export async function chargerIncipit(texteUrl, signal) {
  if (!texteUrl) return "";
  try {
    const r = await fetch(urlLecture(texteUrl), {
      signal,
      headers: { Range: "bytes=0-60000" },
    });
    if (!r.ok && r.status !== 206) return "";
    const texte = await r.text();
    return extraireIncipit(texte);
  } catch (e) {
    return "";
  }
}
