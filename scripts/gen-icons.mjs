// Génère les icônes PWA de Tranche : un fond « papier » plein cadre avec un
// filet de fiche et deux « tranches » verticales (les deux livres du duel).
// Lancer : node scripts/gen-icons.mjs
import { PNG } from "pngjs";
import { writeFileSync } from "fs";

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const PAPIER = hex("#EDEAE2");
const ENCRE = hex("#1A1815");
const ACCENT = hex("#1D4E5A");
const TRAIT = hex("#C9C4B8");

function put(png, x, y, S, c) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = 255;
}
function rect(png, S, x0, y0, x1, y1, c) {
  for (let y = Math.round(y0); y < Math.round(y1); y++)
    for (let x = Math.round(x0); x < Math.round(x1); x++) put(png, x, y, S, c);
}
function frame(png, S, inset, t, c) {
  const a = Math.round(S * inset);
  const b = S - a;
  rect(png, S, a, a, b, a + t, c);
  rect(png, S, a, b - t, b, b, c);
  rect(png, S, a, a, a + t, b, c);
  rect(png, S, b - t, a, b, b, c);
}

function gen(S, path) {
  const png = new PNG({ width: S, height: S });
  rect(png, S, 0, 0, S, S, PAPIER); // fond plein cadre (compatible maskable)
  frame(png, S, 0.14, Math.max(1, Math.round(S * 0.012)), TRAIT);
  const bw = S * 0.135;
  const bh = S * 0.4;
  const y0 = (S - bh) / 2;
  rect(png, S, S * 0.4 - bw / 2, y0, S * 0.4 + bw / 2, y0 + bh, ENCRE);
  rect(png, S, S * 0.6 - bw / 2, y0, S * 0.6 + bw / 2, y0 + bh, ACCENT);
  writeFileSync(path, PNG.sync.write(png));
  console.log("écrit", path, `${S}x${S}`);
}

gen(192, "public/icon-192.png");
gen(512, "public/icon-512.png");
gen(180, "public/apple-touch-icon.png");
gen(64, "public/favicon.png");
