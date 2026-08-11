# Tranche

**Tranche** est une application mobile de découverte de livres du domaine public
en français. À chaque période (jour, semaine ou mois), **deux** livres vous sont
proposés. Vous en voyez **un seul à la fois** et vous balayez horizontalement
pour découvrir l'autre — pas de comparaison côte à côte, pas de filtre par genre :
on découvre, on ne choisit pas sur quoi on tombe.

Vous gardez les livres qui vous intéressent (bibliothèque), vous les notez
(étoiles) et vous écrivez un « carnet » (une phrase, une impression). La lecture
se fait directement dans l'application grâce à [epub.js](https://github.com/futurepress/epub.js/).

Le catalogue est **curé à la main** ; l'API [Gutendex](https://gutendex.com) sert
uniquement à récupérer le fichier epub correspondant sur le Projet Gutenberg.

---

## Pile technique

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/) en **JavaScript**
- **CSS classique** (`src/styles.css`, pas de Tailwind)
- [epub.js](https://www.npmjs.com/package/epubjs) pour la lecture
- [Capacitor 6](https://capacitorjs.com/) pour l'export Android
- API [Gutendex](https://gutendex.com)

---

## Prérequis (Windows)

1. Installez **[Node.js](https://nodejs.org/)** (version LTS, 18 ou supérieure).
   L'installateur ajoute automatiquement `node` et `npm` au PATH.
2. Ouvrez **PowerShell** (menu Démarrer → tapez « PowerShell »).
3. Placez-vous dans le dossier du projet :
   ```powershell
   cd C:\chemin\vers\tranche
   ```

---

## Installation et lancement

Installez les dépendances :

```powershell
npm install
```

Lancez le serveur de développement :

```powershell
npm run dev
```

Ouvrez ensuite l'adresse affichée (par défaut <http://localhost:5173>) dans votre
navigateur. Le proxy de développement de Vite (`/gutenberg`) contourne
automatiquement les restrictions CORS lors de la lecture.

Pour générer la version de production :

```powershell
npm run build      # produit le dossier dist/
npm run preview    # prévisualise le build
```

---

## Ajouter un livre au catalogue

Le catalogue est un simple tableau JavaScript dans **`src/data/livres.js`**.
Pour ajouter un livre, copiez un bloc existant et complétez les champs :

```js
{
  id: "un-identifiant-unique",      // sans espaces ni accents
  titre: "Titre du livre",
  auteur: "Prénom Nom",
  annee: 1880,
  genre: "Roman",                   // sert au contraste des duels
  couleur: "#2E3A4A",               // fond de la couverture typographique
  resume: "Une ou deux phrases courtes et vendeuses.",
  incipit: "La vraie première phrase de l'œuvre.",
},
```

Points importants :

- Le livre doit exister sur le **Projet Gutenberg** en français, au format epub
  (c'est ce que Gutendex recherchera à partir du `titre` et de l'`auteur`).
- La `couleur` est le fond de la couverture (composée uniquement en typographie,
  sans image).
- L'`incipit` sert de **repli** affiché dans le lecteur si l'epub est indisponible.

Enregistrez le fichier : Vite recharge l'application automatiquement.

---

## Export Android (Capacitor)

La configuration Capacitor est déjà en place (`capacitor.config.json`,
`appId` = `app.tranche.lecture`, `appName` = `Tranche`).

```powershell
npm run build            # génère le dossier dist/
npx cap add android      # crée le projet Android (une seule fois)
npx cap sync             # copie le build web dans le projet natif
npx cap open android     # ouvre Android Studio
```

Depuis **Android Studio**, lancez l'application sur un émulateur ou un appareil
connecté (bouton ▶). Après chaque modification du code web, refaites
`npm run build` puis `npx cap sync` pour mettre à jour le projet natif.

> Prérequis Android : [Android Studio](https://developer.android.com/studio) et
> un SDK Android installé.

---

## Structure du projet

```
tranche/
├─ index.html
├─ package.json
├─ vite.config.js
├─ capacitor.config.json
├─ README.md
└─ src/
   ├─ main.jsx              point d'entrée React
   ├─ App.jsx               vues Découverte / Bibliothèque, duel, carrousel
   ├─ styles.css            design (Fraunces / Space Grotesk / Space Mono)
   ├─ data/livres.js        catalogue curé (12 classiques)
   ├─ api/gutendex.js       résolution de l'epub via Gutendex
   └─ components/Reader.jsx  lecteur plein écran epub.js
```
