// Fonction serverless Vercel : proxy fiable pour ws-export.wmcloud.org.
//
// Pourquoi ne pas se contenter d'une réécriture (vercel.json) ? ws-export
// GÉNÈRE l'epub à la volée : la requête peut être lente (grosses œuvres),
// suivre des redirections, ou renvoyer une page d'attente au lieu du fichier.
// Une réécriture Vercel expire trop tôt et ne sait pas réessayer.
//
// Ici on fait la requête CÔTÉ SERVEUR : pas de CORS, on suit les redirections,
// on laisse plus de temps (maxDuration), on réessaie le format alternatif, et
// on ne renvoie au navigateur qu'un fichier réellement valide (signature ZIP).

export const config = { maxDuration: 60 };

const WSEXPORT = "https://ws-export.wmcloud.org";

// Un epub est un zip : il commence par « PK » (0x50 0x4B). Si ws-export renvoie
// du HTML (erreur / page d'attente), la signature ne correspond pas.
function estEpub(buf) {
  return buf && buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
}

async function tirerEpub(page, lang, format) {
  const url =
    `${WSEXPORT}/?lang=${encodeURIComponent(lang)}` +
    `&format=${encodeURIComponent(format)}` +
    `&page=${encodeURIComponent(page)}`;
  const rep = await fetch(url, {
    redirect: "follow",
    headers: {
      // ws-export apprécie un User-Agent identifiable.
      "User-Agent": "Tranche/1.0 (lecture du domaine public en français)",
      Accept: "application/epub+zip,application/octet-stream,*/*",
    },
  });
  if (!rep.ok) throw new Error("ws-export HTTP " + rep.status);
  const buf = Buffer.from(await rep.arrayBuffer());
  if (!estEpub(buf)) throw new Error("réponse non-epub (" + buf.length + " o)");
  return buf;
}

export default async function handler(req, res) {
  const q = req.query || {};
  const page = q.page;
  const lang = q.lang || "fr";
  if (!page) {
    res.status(400).json({ erreur: "paramètre « page » manquant" });
    return;
  }

  // On essaie le format demandé d'abord, puis l'autre (epub-3 <-> epub) :
  // certaines œuvres n'exportent proprement que dans l'un des deux.
  const demande = q.format;
  const formats = demande
    ? [demande, demande === "epub-3" ? "epub" : "epub-3"]
    : ["epub-3", "epub"];

  let derniere = null;
  for (const f of formats) {
    try {
      const buf = await tirerEpub(page, lang, f);
      res.setHeader("Content-Type", "application/epub+zip");
      // Le fichier d'une œuvre du domaine public ne change pas : on autorise
      // un cache long côté CDN (s-maxage) et navigateur (max-age).
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400"
      );
      res.status(200).send(buf);
      return;
    } catch (e) {
      derniere = e;
    }
  }

  res.status(502).json({
    erreur: "epub indisponible",
    page,
    detail: String((derniere && derniere.message) || derniere),
  });
}
