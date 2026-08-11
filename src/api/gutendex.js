// Accès à l'API Gutendex (https://gutendex.com) — un simple index du Projet
// Gutenberg. On ne l'utilise QUE pour retrouver le fichier epub d'un livre
// déjà présent dans notre catalogue curé.

// Cherche un livre par titre + auteur et renvoie l'URL de son epub, ou null.
export async function resoudreEpub({ titre, auteur }) {
  try {
    const requete = encodeURIComponent(titre + " " + auteur);
    const reponse = await fetch(
      "https://gutendex.com/books?languages=fr&search=" + requete
    );
    if (!reponse.ok) return null;
    const data = await reponse.json();
    const resultats = Array.isArray(data.results) ? data.results : [];
    for (const livre of resultats) {
      const formats = livre.formats || {};
      const epub = formats["application/epub+zip"];
      if (epub) return epub;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Adapte l'URL de l'epub pour la lecture :
// - en développement, on passe par le proxy Vite (/gutenberg) pour éviter CORS,
// - en production (build), on renvoie l'URL d'origine telle quelle.
export function urlLecture(url) {
  if (!url) return url;
  if (import.meta.env.DEV) {
    return url.replace(/^https:\/\/(www\.)?gutenberg\.org/, "/gutenberg");
  }
  return url;
}
