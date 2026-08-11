// Pont natif (Capacitor). Isolé dans son propre module pour ne PAS alourdir
// le bundle principal : seul le lecteur (chargé à la demande) l'importe.
import { Capacitor, CapacitorHttp } from "@capacitor/core";

// Vrai uniquement dans l'app empaquetée (Android/iOS), faux sur le web.
export function estNatif() {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
}

function base64EnArrayBuffer(b64) {
  const binaire = atob(b64);
  const n = binaire.length;
  const octets = new Uint8Array(n);
  for (let i = 0; i < n; i++) octets[i] = binaire.charCodeAt(i);
  return octets.buffer;
}

// Télécharge l'epub en ArrayBuffer via la couche native (contourne le CORS,
// puisqu'en natif il n'y a ni proxy Vite ni réécriture Vercel).
export async function telechargerEpubBuffer(url) {
  const rep = await CapacitorHttp.get({ url, responseType: "arraybuffer" });
  const data = rep && rep.data;
  if (data instanceof ArrayBuffer) return data;
  if (typeof data === "string") return base64EnArrayBuffer(data); // natif : base64
  throw new Error("Réponse binaire inattendue de CapacitorHttp");
}
