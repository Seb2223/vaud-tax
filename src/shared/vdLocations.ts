// Where each code lives inside the VaudTax online service (IG 2025, "Comment remplir ... dans la prestation en ligne VaudTax").

export interface TaxLocation {
  officialLabel: string;
  path: string[];
}

const SALARIED = "Activités salariées (codes 100 à 120)";
const SALARIED_ITEM = "Principale, accessoire, allocations non versées par l’employeur, administrateur : honoraires, tantièmes et autres";
const PRO = "Frais professionnels et interruption de travail (codes 140 à 165)";
const INSURANCE = "Primes et cotisations d’assurances (codes 300, 310, 320, 640)";
const INSURANCE_ITEM = "Cotisations assurance-maladie et accidents, subsides, assurances sur la vie et de prévoyance";
const SPECIAL = "Déductions spéciales sur le revenu (codes 618 à 720)";
const CHILDREN = "Enfants et personnes à charge";
const PENSIONS = "Rentes et pensions (codes 240 à 280)";
const PENSIONS_ITEM =
  "Rentes AVS et AI, rentes provenant d’institutions de prévoyance professionnelle, rentes provenant de formes reconnues de la prévoyance individuelle liée, autres rentes";

export const VAUDTAX: Record<string, TaxLocation> = {
  "100": { officialLabel: "Activité salariée principale", path: [SALARIED, SALARIED_ITEM] },
  "105": { officialLabel: "Activité salariée accessoire", path: [SALARIED, SALARIED_ITEM] },
  "110": { officialLabel: "Allocations non versées par l’employeur", path: [SALARIED, SALARIED_ITEM] },
  "140": { officialLabel: "Frais de transport du domicile au lieu de travail", path: [PRO, "Frais de transport"] },
  "150": { officialLabel: "Repas pris hors du domicile", path: [PRO, "Frais de repas et frais de repas du soir (séjour hors du domicile)"] },
  "160": { officialLabel: "Autres frais professionnels", path: [PRO, "Autres frais professionnels et frais pour activité salariée accessoire"] },
  "165": { officialLabel: "Frais pour activité salariée accessoire", path: [PRO, "Autres frais professionnels et frais pour activité salariée accessoire"] },
  "work-interruption": { officialLabel: "Périodes d’interruption de travail", path: [PRO, "Périodes d’interruption de travail"] },
  "180": {
    officialLabel: "Activité indépendante",
    path: [
      "Activités indépendantes, sociétés en nom collectif ou en commandite, perte sur participations qualifiées commerciales (codes 180 à 190, 330, 450 à 465)",
      "Activités indépendantes, sociétés en nom collectif ou en commandite, perte sur participations qualifiées commerciales",
    ],
  },
  "186": {
    officialLabel: "Perte commerciale non compensée",
    path: [
      "Activités indépendantes, sociétés en nom collectif ou en commandite, perte sur participations qualifiées commerciales (codes 180 à 190, 330, 450 à 465)",
    ],
  },
  "465": {
    officialLabel: "Autres actifs d’exploitation (sauf immeubles et placements commerciaux)",
    path: ["Activités indépendantes, sociétés en nom collectif ou en commandite, perte sur participations qualifiées commerciales (codes 180 à 190, 330, 450 à 465)"],
  },
  "195": { officialLabel: "Autres revenus de toute nature", path: ["Autres revenus de toute nature (code 195)", "Autres revenus de toute nature"] },
  "200": {
    officialLabel: "Assurance-chômage, service militaire (AC + APG)",
    path: ["Indemnités perte de gain (codes 200 à 220)", "Assurance chômage (AC) et service militaire (APG), indemnités maladie, accidents et invalidité"],
  },
  "210": {
    officialLabel: "Indemnités journalières",
    path: ["Indemnités perte de gain (codes 200 à 220)", "Assurance chômage (AC) et service militaire (APG), indemnités maladie, accidents et invalidité"],
  },
  "235": { officialLabel: "Déduction pour double activité des conjoints", path: ["(calculée automatiquement par VaudTax à partir des revenus des deux conjoints)"] },
  "240": { officialLabel: "1er pilier : rentes AVS / AI et assurances militaires", path: [PENSIONS, PENSIONS_ITEM] },
  "250": { officialLabel: "2e pilier : rentes provenant d’institutions de prévoyance professionnelle", path: [PENSIONS, PENSIONS_ITEM] },
  "260": { officialLabel: "3e pilier A : rentes provenant de la prévoyance individuelle liée", path: [PENSIONS, PENSIONS_ITEM] },
  "270": { officialLabel: "3e pilier B : autres rentes et pensions", path: [PENSIONS, PENSIONS_ITEM] },
  "280": { officialLabel: "Pensions alimentaires obtenues", path: [PENSIONS, "Pensions alimentaires obtenues"] },
  "300": { officialLabel: "Assurances-maladie et accidents, assurances sur la vie", path: [INSURANCE, INSURANCE_ITEM] },
  "310": { officialLabel: "Prévoyance individuelle liée 3e pilier A", path: [INSURANCE, INSURANCE_ITEM] },
  "320": { officialLabel: "Rachats d’années d’assurance (2e pilier)", path: [INSURANCE, INSURANCE_ITEM] },
  "330": { officialLabel: "Cotisations des indépendants", path: ["Activités indépendantes, sociétés en nom collectif ou en commandite, perte sur participations qualifiées commerciales (codes 180 à 190, 330, 450 à 465)"] },
  "340": { officialLabel: "Autres cotisations (perte de gain)", path: [INSURANCE, INSURANCE_ITEM] },
  "410-accounts": {
    officialLabel: "État des titres – comptes et livrets",
    path: ["Etat des titres - Comptes et livrets, comptes-métal, crypto-monnaies (code 410)", "Comptes et livrets bancaires, postaux, comptes-métal, crypto-monnaies, garantie de loyer, leasing, etc"],
  },
  "410-securities": {
    officialLabel: "État des titres – actions, obligations, fonds, relevé fiscal",
    path: ["Etat des titres - Actions, obligations, fonds de placement, relevé fiscal, créances, etc. (code 410)"],
  },
  "420": { officialLabel: "Numéraire, or, métaux précieux, crypto-monnaies", path: ["Autres éléments de fortune et revenus de fortune (codes 420 à 445)"] },
  "430": { officialLabel: "Autos, motos, collections, bijoux, etc.", path: ["Autres éléments de fortune et revenus de fortune (codes 420 à 445)"] },
  "435": { officialLabel: "Assurances sur la vie et de rentes (valeur de rachat)", path: ["Autres éléments de fortune et revenus de fortune (codes 420 à 445)", "Assurances sur la vie"] },
  "480": { officialLabel: "Déduction des intérêts de capitaux d’épargne", path: ["(calculée par VaudTax à partir de l’état des titres)"] },
  "490": { officialLabel: "Frais d’administration de titres", path: ["Etat des titres - Frais d’administration (code 490)"] },
  "500": { officialLabel: "Immeubles privés", path: ["Immeubles, terrains et forêts (codes 500 à 540)"] },
  "540": { officialLabel: "Frais d’entretien d’immeubles", path: ["Immeubles, terrains et forêts (codes 500 à 540)"] },
  "610": { officialLabel: "Intérêts des dettes privées", path: ["Intérêts et dettes (codes 610 et 615)", "Intérêts et dettes"] },
  "615": { officialLabel: "Dettes privées", path: ["Intérêts et dettes (codes 610 et 615)", "Intérêts et dettes"] },
  "618": { officialLabel: "Frais de formation, de perfectionnement et de reconversion", path: [SPECIAL, "Frais de perfectionnement et de formation"] },
  "620": { officialLabel: "Versements en faveur de partis politiques", path: [SPECIAL, "Rentes et charges durables et versements à des partis politiques"] },
  "630": { officialLabel: "Pensions alimentaires versées", path: [SPECIAL, "Pensions alimentaires versées"] },
  "640": { officialLabel: "Cotisations AVS/AI/APG/AC (sans activité lucrative)", path: [INSURANCE, INSURANCE_ITEM] },
  "660": { officialLabel: "Déduction sociale pour le logement", path: ["(indiquer le loyer net annuel sans charges à l’emplacement prévu ; VaudTax calcule la déduction)"] },
  "670": { officialLabel: "Déduction pour frais de garde", path: [CHILDREN, "Enfants mineurs (2008 à 2025) et enfants majeurs en apprentissage ou aux études, frais de garde"] },
  "680": { officialLabel: "Déduction pour personne à charge", path: [CHILDREN, "Autres personnes incapables de subvenir seules à leurs besoins à la charge du/de la contribuable"] },
  "695": { officialLabel: "Déduction pour contribuable modeste", path: ["(calculée automatiquement par VaudTax)"] },
  "710": { officialLabel: "Frais médicaux et dentaires / frais liés à un handicap", path: [SPECIAL, "Frais médicaux et dentaires"] },
  "720": { officialLabel: "Dons à des institutions d’utilité publique", path: [SPECIAL, "Dons à des institutions d’utilité publique"] },
  "725": { officialLabel: "Déduction pour famille", path: ["(calculée automatiquement par VaudTax)"] },
  "810": { officialLabel: "Parts résultant de la situation de famille (quotient familial)", path: [CHILDREN] },
};

export const loc = (code: string): TaxLocation => VAUDTAX[code] ?? { officialLabel: `Code ${code}`, path: [] };
