// Source Wikisource FR, via l'API MediaWiki (fr.wikisource.org).
// - Recherche / listing : action=query (CORS ok avec origin=*).
// - Auteur : premier lien vers le namespace « Auteur: » de la page.
// - Résumé : extrait en texte brut (début de l'œuvre) — vrai français.
// - Lecture : epub généré par ws-export (proxifié en /wsexport à la lecture).
// - Couvertures : typographiques (Wikisource n'a pas de couverture propre).

const WS_API = "https://fr.wikisource.org/w/api.php";
const WSEXPORT = "https://ws-export.wmcloud.org";
const NS_AUTEUR = 102; // namespace « Auteur: » sur fr.wikisource

const PALETTE = [
  "#5A3E1B", "#7A2E2E", "#4A2E52", "#3B4A2F", "#2E3A4A", "#1B4A3A",
  "#2E4A52", "#5A5A1B", "#8A5A1B", "#52304A", "#3A5A4A", "#7A6A1B",
];
function hash(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function couleurPour(cle) {
  return PALETTE[hash(String(cle)) % PALETTE.length];
}

const _cache = new Map();
const _TTL = 10 * 60 * 1000;
async function apiJson(url, signal) {
  const hit = _cache.get(url);
  if (hit && Date.now() - hit.t < _TTL) return hit.data;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  _cache.set(url, { t: Date.now(), data: d });
  return d;
}

function nettoyerExtrait(txt) {
  if (!txt) return "";
  let s = String(txt).replace(/\s+/g, " ").trim();
  if (s.length > 300) {
    const c = s.slice(0, 300);
    const p = c.lastIndexOf(". ");
    s = p > 120 ? c.slice(0, p + 1) : c.trim() + "…";
  }
  return s;
}

// URL de l'epub ws-export (réécrite via le proxy /wsexport à la lecture).
export function urlEpubWs(titre) {
  return `${WSEXPORT}/?format=epub-3&lang=fr&page=${encodeURIComponent(titre)}`;
}

function normaliserWs(page, genre) {
  if (!page || !page.title || page.missing !== undefined) return null;
  // On écarte les pages de maintenance / sous-pages techniques.
  if (/\//.test(page.title) && !genre) {
    // les sous-pages (chapitres) polluent la recherche — on garde les racines
  }
  const id = "ws-" + (page.pageid || page.title);
  let auteur = "";
  const liens = Array.isArray(page.links) ? page.links : [];
  const lienAuteur = liens.find((l) => l.ns === NS_AUTEUR && l.title);
  if (lienAuteur) auteur = lienAuteur.title.replace(/^Auteur:/, "").trim();

  const resume =
    nettoyerExtrait(page.extract) ||
    "Un texte du domaine public, relu sur Wikisource.";

  return {
    id,
    titre: page.title,
    auteur: auteur || "Wikisource",
    annee: null,
    epoque: null,
    genre: genre || "Littérature",
    couleur: couleurPour(id),
    couvertureUrl: null, // couverture typographique
    telechargements: 0,
    resume,
    incipit: "",
    sourceType: "wikisource",
    wsPage: page.title,
  };
}

// Récupère une page de résultats Wikisource, forme identique à pageCatalogue :
// { livres, suivant }. `category` = nom de catégorie (sans le préfixe), sinon
// on liste « Bon pour export » (textes validés, prêts à l'export).
export async function pageWikisource({
  search = null,
  category = null,
  genreLabel = null,
  page = 1,
  signal,
} = {}) {
  const commun =
    "action=query&format=json&origin=*" +
    "&prop=extracts|links&explaintext=1&exchars=320&exlimit=20" +
    "&pllimit=500&plnamespace=" +
    NS_AUTEUR;

  let url;
  let paginable = false;
  if (search) {
    const offset = (page - 1) * 20;
    url =
      `${WS_API}?${commun}` +
      `&generator=search&gsrsearch=${encodeURIComponent(search)}` +
      `&gsrnamespace=0&gsrlimit=20&gsroffset=${offset}`;
    paginable = true;
  } else {
    const cat = category || "Bon pour export";
    url =
      `${WS_API}?${commun}` +
      `&generator=categorymembers` +
      `&gcmtitle=${encodeURIComponent("Catégorie:" + cat)}` +
      `&gcmnamespace=0&gcmlimit=40`;
    // La pagination par catégorie nécessite un jeton de continuation : on s'en
    // tient à la première fournée pour cette version.
    paginable = false;
  }

  const data = await apiJson(url, signal);
  const pages =
    data && data.query && data.query.pages
      ? Object.values(data.query.pages)
      : [];
  const livres = pages
    .map((p) => normaliserWs(p, genreLabel))
    .filter(Boolean);

  return { livres, suivant: paginable && livres.length >= 20 };
}
