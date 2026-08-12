// Stockage durable, asynchrone.
// - En natif (Capacitor), on utilise @capacitor/preferences : les données
//   survivent à un vidage du cache de la WebView (contrairement à localStorage,
//   qui peut y être purgé).
// - Sur le web, on retombe sur localStorage.
//
// L'API est volontairement minimale : get / set / remove (valeurs texte).
// Le JSON est géré par les appelants.
import { estNatif } from "./native.js";

const PREFIXE = "tranche.";
const CLE_MIGRE = "tranche.__migre";

// Chargement paresseux du plugin natif (garde @capacitor/preferences hors du
// chemin web et n'alourdit pas le premier paint).
let prefsPromise = null;
function prefs() {
  if (!prefsPromise) {
    prefsPromise = import("@capacitor/preferences").then((m) => m.Preferences);
  }
  return prefsPromise;
}

export async function get(cle) {
  try {
    if (estNatif()) {
      const P = await prefs();
      const { value } = await P.get({ key: cle });
      return value == null ? null : value;
    }
    return localStorage.getItem(cle);
  } catch (e) {
    // Repli local en cas d'échec du plugin.
    try {
      return localStorage.getItem(cle);
    } catch (_) {
      return null;
    }
  }
}

export async function set(cle, valeur) {
  try {
    if (estNatif()) {
      const P = await prefs();
      await P.set({ key: cle, value: String(valeur) });
      return;
    }
    localStorage.setItem(cle, String(valeur));
  } catch (e) {
    /* stockage indisponible : on ignore */
  }
}

export async function remove(cle) {
  try {
    if (estNatif()) {
      const P = await prefs();
      await P.remove({ key: cle });
      return;
    }
    localStorage.removeItem(cle);
  } catch (e) {
    /* ignore */
  }
}

// Migration one-shot au premier lancement NATIF : recopie toutes les clés
// "tranche.*" déjà présentes dans localStorage vers Preferences, pour ne pas
// perdre les données stockées avant l'ajout de la persistance durable.
export async function migrerVersNatif() {
  if (!estNatif()) return;
  try {
    const P = await prefs();
    const dejaFait = await P.get({ key: CLE_MIGRE });
    if (dejaFait && dejaFait.value) return;

    if (typeof localStorage !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIXE)) {
          const v = localStorage.getItem(k);
          if (v != null) await P.set({ key: k, value: v });
        }
      }
    }
    await P.set({ key: CLE_MIGRE, value: "1" });
  } catch (e) {
    /* si la migration échoue, on ne bloque pas le démarrage */
  }
}
