// Catalogue CURÉ à la main. Chaque entrée est un classique français réel,
// disponible sur le Projet Gutenberg. Gutendex sert uniquement à retrouver
// le fichier epub correspondant au moment de la lecture.
//
// Champs : { id, titre, auteur, annee, genre, couleur, resume, incipit }
// - couleur : fond de la couverture typographique (pas d'image).
// - resume  : 1 à 2 phrases courtes et vendeuses.
// - incipit : la vraie première phrase de l'œuvre (repli si l'epub échoue).

export const LIVRES = [
  {
    id: "candide",
    titre: "Candide",
    auteur: "Voltaire",
    annee: 1759,
    genre: "Conte philosophique",
    couleur: "#5A3E1B",
    resume:
      "Chassé d'un château pour un baiser, un jeune naïf traverse le monde et ses catastrophes. La leçon tient en une phrase : il faut cultiver son jardin.",
    incipit:
      "Il y avait en Westphalie, dans le château de monsieur le baron de Thunder-ten-tronckh, un jeune garçon à qui la nature avait donné les mœurs les plus douces.",
  },
  {
    id: "pere-goriot",
    titre: "Le Père Goriot",
    auteur: "Honoré de Balzac",
    annee: 1835,
    genre: "Roman",
    couleur: "#7A2E2E",
    resume:
      "Dans une pension parisienne, un vieil homme se ruine pour ses filles ingrates. Le portrait féroce d'une société où tout s'achète.",
    incipit:
      "Madame Vauquer, née de Conflans, est une vieille femme qui, depuis quarante ans, tient à Paris une pension bourgeoise établie rue Neuve-Sainte-Geneviève, entre le quartier latin et le faubourg Saint-Marceau.",
  },
  {
    id: "rouge-et-noir",
    titre: "Le Rouge et le Noir",
    auteur: "Stendhal",
    annee: 1830,
    genre: "Roman",
    couleur: "#4A2E52",
    resume:
      "Fils de charpentier dévoré d'ambition, Julien Sorel gravit la société par l'amour et l'hypocrisie. Une ascension qui sent la poudre.",
    incipit:
      "La petite ville de Verrières peut passer pour l'une des plus jolies de la Franche-Comté.",
  },
  {
    id: "madame-bovary",
    titre: "Madame Bovary",
    auteur: "Gustave Flaubert",
    annee: 1857,
    genre: "Roman",
    couleur: "#3B4A2F",
    resume:
      "Une femme de province étouffe dans un mariage sans relief et poursuit des rêves d'ailleurs. Le chef-d'œuvre du désir et de la désillusion.",
    incipit:
      "Nous étions à l'étude, quand le proviseur entra, suivi d'un nouveau habillé en bourgeois et d'un garçon de classe qui portait un grand pupitre.",
  },
  {
    id: "miserables",
    titre: "Les Misérables",
    auteur: "Victor Hugo",
    annee: 1862,
    genre: "Roman",
    couleur: "#2E3A4A",
    resume:
      "Un ancien forçat cherche la rédemption tandis qu'un policier le traque sans relâche. Une fresque immense sur la justice et la pitié.",
    incipit:
      "En 1815, M. Charles-François-Bienvenu Myriel était évêque de Digne.",
  },
  {
    id: "monte-cristo",
    titre: "Le Comte de Monte-Cristo",
    auteur: "Alexandre Dumas",
    annee: 1844,
    genre: "Aventure",
    couleur: "#1B4A3A",
    resume:
      "Trahi et emprisonné, un jeune marin s'évade, s'enrichit et revient sous un nom d'emprunt. La plus belle mécanique de vengeance jamais écrite.",
    incipit:
      "Le 24 février 1815, la vigie de Notre-Dame de la Garde signala le trois-mâts le Pharaon, venant de Smyrne, Trieste et Naples.",
  },
  {
    id: "vingt-mille-lieues",
    titre: "Vingt mille lieues sous les mers",
    auteur: "Jules Verne",
    annee: 1870,
    genre: "Aventure",
    couleur: "#2E4A52",
    resume:
      "À bord du Nautilus, le capitaine Nemo entraîne ses prisonniers au fond des océans. Un voyage sous-marin où la science côtoie le vertige.",
    incipit:
      "L'année 1866 fut marquée par un événement bizarre, un phénomène inexpliqué et inexplicable que personne n'a sans doute oublié.",
  },
  {
    id: "germinal",
    titre: "Germinal",
    auteur: "Émile Zola",
    annee: 1885,
    genre: "Roman social",
    couleur: "#5A5A1B",
    resume:
      "Au fond de la mine, des ouvriers affamés se dressent contre la faim et l'injustice. Le grand roman de la grève et de l'espoir qui germe.",
    incipit:
      "Dans la plaine rase, sous la nuit sans étoiles, d'une obscurité et d'une épaisseur d'encre, un homme suivait seul la grande route de Marchiennes à Montsou.",
  },
  {
    id: "boule-de-suif",
    titre: "Boule de Suif",
    auteur: "Guy de Maupassant",
    annee: 1880,
    genre: "Nouvelle",
    couleur: "#8A5A1B",
    resume:
      "Dans une diligence fuyant la guerre, une femme méprisée devient l'otage de la lâcheté des honnêtes gens. Une nouvelle d'une cruauté parfaite.",
    incipit:
      "Pendant plusieurs jours de suite des lambeaux d'armée en déroute avaient traversé la ville.",
  },
  {
    id: "le-horla",
    titre: "Le Horla",
    auteur: "Guy de Maupassant",
    annee: 1887,
    genre: "Fantastique",
    couleur: "#52304A",
    resume:
      "Un homme sent une présence invisible s'installer chez lui et boire sa vie. La descente au vertige, tenue par un journal de plus en plus fiévreux.",
    incipit:
      "8 mai. Quelle journée admirable ! J'ai passé toute la matinée étendu sur l'herbe, devant ma maison, sous l'énorme platane qui la couvre tout entière.",
  },
  {
    id: "arsene-lupin",
    titre: "Arsène Lupin, gentleman cambrioleur",
    auteur: "Maurice Leblanc",
    annee: 1907,
    genre: "Policier",
    couleur: "#3A5A4A",
    resume:
      "Élégant, insaisissable, toujours d'un coup d'avance : le plus célèbre voleur de France défie la police et le lecteur. Le plaisir pur de l'énigme.",
    incipit: "L'étrange voyage ! Il avait si bien commencé cependant !",
  },
  {
    id: "fleurs-du-mal",
    titre: "Les Fleurs du mal",
    auteur: "Charles Baudelaire",
    annee: 1857,
    genre: "Poésie",
    couleur: "#7A6A1B",
    resume:
      "De la boue tirer de l'or : Baudelaire fait de l'ennui, du vice et de la beauté une seule et même musique. Le recueil qui a inventé la modernité.",
    incipit:
      "La sottise, l'erreur, le péché, la lésine, occupent nos esprits et travaillent nos corps.",
  },
];

export default LIVRES;
