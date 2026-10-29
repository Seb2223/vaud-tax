// Official figures for tax period 2025, canton of Vaud (ICC) and federal (IFD).
// Every number carries its source so it can be checked against the documents
// stored in research/:
//   IG  = Instructions générales 2025 (21001 / 03.26), vd.ch
//   IC  = Instructions complémentaires propriété immobilière 2025 (21004 / 01.26)
//   58c = ESTV form 58c 2025, federal tax scales

export const SOURCES = {
  IG: "Instructions générales 2025 (ACI Vaud, doc 21001)",
  IC: "Instructions complémentaires propriété immobilière 2025 (ACI Vaud, doc 21004)",
  F58C: "ESTV form 58c 2025 (federal tax scales)",
} as const;

export const src = (doc: keyof typeof SOURCES, page: number | string) => `${SOURCES[doc]}, p. ${page}`;

/** Public-transport flat rate by one-way km (IG p. 19–20). Index = km; ≤2 km uses the 2 km value. */
const PT_TABLE: Record<number, number> = {
  2: 1176, 3: 1423, 4: 1587, 5: 1669, 6: 1849, 7: 1947, 8: 2094, 9: 2224, 10: 2372,
  11: 2452, 12: 2531, 13: 2626, 14: 2706, 15: 2786, 16: 2856, 17: 2896, 18: 2936, 19: 2976,
  20: 3001, 21: 3026, 22: 3051, 23: 3076, 24: 3101, 25: 3136, 26: 3166, 27: 3196, 28: 3226, 29: 3256,
  30: 3288, 31: 3320, 32: 3352, 33: 3384, 34: 3416, 35: 3448, 36: 3480, 37: 3512, 38: 3544, 39: 3576,
  40: 3608, 41: 3640, 42: 3672, 43: 3704, 44: 3736, 45: 3768,
  46: 3800, 47: 3832, 48: 3864, 49: 3896, 50: 3928, 51: 4080,
};

export function publicTransportFlatRate(km: number): number {
  if (km <= 0) return 0;
  const k = Math.min(51, Math.max(2, Math.round(km)));
  return PT_TABLE[k];
}

export const R = {
  commute: {
    bikePerYear: 700, // IG p. 20
    motorbikePerKm: 0.4,
    carPerKmFirst15000: 0.7,
    carPerKmBeyond: 0.35,
    carThresholdKm: 15000,
    fullYearDays: 240, // IG p. 19
    ptCap: 4080, // = 51 km flat rate, cost of a 2nd-class GA (IG p. 20)
    ifdCap: 3300, // IG p. 62
  },
  meals: { outside: 3200, canteen: 1600, shift: 3200 }, // IG p. 21
  otherProfessional: { rate: 0.03, min: 2000, max: 4000 }, // IG p. 22 (same for IFD)
  secondaryJob: { rate: 0.2, min: 800, max: 2400 }, // IG p. 23
  dualIncomeIcc: 1700, // IG p. 26
  dualIncomeIfd: { rate: 0.5, min: 8600, max: 14100 }, // IG p. 62
  pillar3a: { withPensionFund: 7258, withoutPensionFundRate: 0.2, withoutPensionFundMax: 36288 }, // IG p. 31
  insurance: {
    icc: { single: 5000, married: 9900, perChild: 1300, perDependent: 1300 }, // IG p. 30
    ifd: { single: 1800, married: 3700, perChild: 700, noPensionContributionsFactor: 1.5 }, // IG p. 63
  },
  savingsInterest: { single: 1600, married: 3300, perChild: 300 }, // IG p. 40 (ICC only)
  securitiesAdminFlatRate: 0.0015, // 1.5‰ (IG p. 40)
  furnitureExemption: { single: 60000, married: 120000 }, // IG p. 39
  debtInterestAllowanceAboveWealthIncome: 50000, // IG p. 41
  training: { icc: 12000, ifd: 13000 }, // IG p. 42, 63
  politicalParties: { icc: 10100, ifd: 10600 }, // IG p. 43, 63
  housing: {
    maxRentSingle: 11100,
    maxRentCoupleOrSingleParent: 13700,
    perChild: 3700,
    incomeShare: 0.2,
    maxDeduction: 6800,
  }, // IG p. 44
  childcare: { icc: 15200, ifd: 25800, maxAge: 14 }, // IG p. 44, 63
  dependentIcc: 3400, // IG p. 45
  medicalFranchise: 0.05, // IG p. 48
  donations: { maxShare: 0.2, minTotal: 100 }, // IG p. 49
  family: {
    married: 1300,
    singleParent: 2800,
    perChild: 1000,
    threshold: 126300,
    step1Until: 164100,
    step1Size: 2100,
    step2Size: 1000,
    stepAmount: 100,
  }, // IG p. 49–50
  // Modest-taxpayer deduction tables (IG p. 46–47). Index = household size (persons).
  modest: {
    A: { limit: [0, 50900, 61400, 71900, 82400, 92900, 103400, 113900], max: [0, 17000, 20500, 24000, 27500, 31000, 34500, 38000] },
    B: { limit: [0, 0, 68000, 78500, 89000, 99500, 110000, 120500], max: [0, 0, 22700, 26200, 29700, 33200, 36700, 40200] },
    C: { limit: [0, 0, 71000, 81500, 92000, 102500, 113000, 123500], max: [0, 0, 23700, 27200, 30700, 34200, 37700, 41200] },
    extraPersonLimit: 10500,
    extraPersonMax: 3500,
  },
  quotient: {
    single: 1.0,
    married: 1.8,
    singleParent: 1.3,
    perChild: 0.5,
    // Quotient cap (IG p. 52–54). Index = number of children (1–5).
    capIncome: [0, 212900, 236500, 260100, 283700, 307300],
    marriedCapDeduction: [0, 25713, 46925, 65682, 82953, 99257],
    singleParentCapDeduction: [0, 45491, 79097, 107184],
    singleWithChildCapDeduction: [0, 70967, 118250, 156060],
  },
  wealthExemption: { single: 60000, married: 120000 }, // IG p. 51
  cantonalCoefficient: 1.55, // 155% (IG p. 60)
  cantonalIncomeReduction: 0.04, // 4% of cantonal base income tax (IG p. 61, example)
  maxIncomeTaxShare: 0.3, // cantonal + communal income tax ≤ 30% of taxable income (LI art. 47)
  ifd: {
    marriedDeduction: 2800,
    childDeduction: 6800,
    dependentDeduction: 6800,
    childRebate: 263,
  }, // IG p. 63–64
  property: {
    indexation: 1.3, // 130% (IC p. 11)
    iccShare: 0.65, // IC p. 20
    ifdShare: 0.9, // IC p. 19
    groupedHousingCoef: 0.9, // IC p. 19
    maintenanceIcc: { youngRate: 0.2, oldRate: 0.3, youngMaxAge: 20 }, // of ICC rental value (IC p. 9)
    rentalMaintenanceIcc: { youngRate: 0.1, youngCap: 15000, oldRate: 0.2, oldCap: 30000 },
    maintenanceIfd: { youngRate: 0.1, oldRate: 0.2, youngMaxAge: 10 }, // IC p. 23
  },
} as const;

/** ICC income tax scale 2025 (IG p. 60): [from income, tax at that point, rate per CHF 100 above]. */
export const ICC_INCOME_SCALE: [number, number, number][] = [
  [0, 0, 1.0],
  [100, 1.0, 1.0],
  [1600, 16.0, 2.0],
  [3400, 52.0, 3.0],
  [5100, 103.0, 4.0],
  [8300, 231.0, 5.0],
  [11900, 411.0, 6.0],
  [15100, 603.0, 7.0],
  [23600, 1198.0, 8.0],
  [40500, 2550.0, 9.0],
  [57200, 4053.0, 10.0],
  [74300, 5763.0, 11.0],
  [91100, 7611.0, 12.0],
  [108000, 9639.0, 12.5],
  [134900, 13001.5, 13.0],
  [161900, 16511.5, 13.5],
  [192300, 20615.5, 14.0],
  [222800, 24885.5, 14.5],
  [255800, 29670.5, 15.0],
  [291400, 35010.5, 15.5],
];

/** ICC wealth tax scale 2025 (IG p. 60): [from wealth, tax, rate per CHF 1000 above]. */
export const ICC_WEALTH_SCALE: [number, number, number][] = [
  [60000, 32.65, 0.97],
  [95000, 66.6, 1.69],
  [120000, 108.85, 1.69],
  [177000, 205.2, 2.42],
  [355000, 635.95, 3.15],
  [710000, 1754.2, 3.39],
];

/** IFD 2025, single persons (58c): [from, tax, rate per CHF 100]. Flat 11.5% from 793,400. */
export const IFD_SINGLE_SCALE: [number, number, number][] = [
  [0, 0, 0],
  [15200, 0, 0.77],
  [33200, 138.6, 0.88],
  [43500, 229.2, 2.64],
  [58000, 612.0, 2.97],
  [76100, 1149.55, 5.94],
  [82000, 1500.0, 6.6],
  [108800, 3268.8, 8.8],
  [141500, 6146.4, 11.0],
  [185000, 10933.6, 13.2],
];
export const IFD_SINGLE_FLAT_FROM = 793400;

/** IFD 2025, married couples and single parents (58c). Flat 11.5% from 940,900. */
export const IFD_MARRIED_SCALE: [number, number, number][] = [
  [0, 0, 0],
  [29700, 0, 1],
  [53400, 237, 2],
  [61300, 395, 3],
  [79100, 929, 4],
  [94900, 1561, 5],
  [108600, 2246, 6],
  [120500, 2960, 7],
  [130500, 3660, 8],
  [138300, 4284, 9],
  [144200, 4815, 10],
  [148200, 5215, 11],
  [150300, 5446, 12],
  [152300, 5686, 13],
];
export const IFD_MARRIED_FLAT_FROM = 940900;
export const IFD_FLAT_RATE = 0.115;

/** Rental value base table (IC p. 13–14): m² → annual rent (CHF), recensement 2000. */
export const RENTAL_BASE: [number, number][] = [
  [10, 3094], [12, 3611], [14, 4098], [16, 4559], [18, 4994], [20, 5405], [22, 5796], [24, 6166], [26, 6518], [28, 6854],
  [30, 7175], [32, 7483], [34, 7779], [36, 8064], [38, 8341], [40, 8609], [42, 8872], [44, 9128], [46, 9381], [48, 9631],
  [50, 9655], [52, 9896], [54, 10137], [56, 10378], [58, 10621], [60, 10866], [62, 11113], [64, 11365], [66, 11620], [68, 11879],
  [70, 12144], [72, 12414], [74, 12690], [76, 12971], [78, 13259], [80, 13322], [82, 13618], [84, 13919], [86, 14228], [88, 14542],
  [90, 14863], [92, 15190], [94, 15523], [96, 15861], [98, 16205], [100, 16553], [102, 16906], [104, 17263], [106, 17623], [108, 17987],
  [110, 18352], [112, 18719], [114, 19087], [116, 19454], [118, 19821], [120, 21232], [122, 21613], [124, 21989], [126, 22361], [128, 22726],
  [130, 23083], [135, 23934], [140, 24707], [145, 25376], [150, 25918], [155, 26504], [160, 27073], [165, 27624], [170, 28158], [175, 28673],
  [180, 29170], [185, 29650], [190, 30112], [195, 30555], [200, 30981], [210, 31780], [220, 32587], [230, 33441], [240, 34296], [250, 35150],
  [260, 36005], [270, 36860], [280, 37714], [290, 38569], [300, 39424],
];

/** Building-age coefficient (IC p. 15). */
export function buildingAgeCoefficient(year: number): number {
  if (year <= 1930) return 0.89;
  if (year <= 1942) return 0.9;
  if (year <= 1967) return 0.91;
  if (year <= 1976) return 0.92;
  if (year <= 1981) return 0.93;
  if (year <= 1985) return 0.94;
  if (year <= 1989) return 0.95;
  if (year <= 1992) return 0.96;
  if (year <= 1994) return 0.97;
  if (year <= 1996) return 0.98;
  if (year <= 1999) return 0.99;
  return 1.0;
}

export function rentalBaseValue(m2: number): number {
  if (m2 < 10) return 0;
  if (m2 > 300) return 39424 + Math.floor((m2 - 300) / 10) * 855;
  let value = 0;
  for (const [size, rent] of RENTAL_BASE) {
    if (size <= m2) value = rent;
    else break;
  }
  return value;
}
