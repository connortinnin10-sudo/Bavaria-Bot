const { getSheetsClient } = require("./sheets");

const HONOURS_SHEET_ID = process.env.HONOURS_SHEET_ID;

// Every in-scope tab shares the same layout: D=Username, H=Category/Type,
// I=Value (the thing that maps to a role), J=Status. Confirmed against live
// sheet data — not inferred. The bot only ever reads this sheet, never writes.
const RANGE_BY_TAB = {
  MedalsRoster: "MedalsRoster!D2:J",
  Venerations:  "Venerations!D2:J",
  Nobility:     "Nobility!D2:J",
  Grandbattles: "Grandbattles!D2:J",
};

// Only these J values count as "currently valid" per tab. Denied/Expired/Closed/
// pending-review states are excluded — "Closed" in particular showed up on real
// Venerations/Grandbattles rows and reads as "this cycle ended", not "active".
const VALID_STATUS_BY_TAB = {
  MedalsRoster: new Set(["Approved"]),
  Venerations:  new Set(["Active"]),
  Nobility:     new Set(["Approved"]),
  Grandbattles: new Set(["Approved"]),
};

// --- Nobility: base tier (Chevalier/Baron/Comte/Duc) -> role ID ---
const NOBILITY_TIER_ROLES = {
  Chevalier: "1228796116510834830",
  Baron:     "1228796471395094549",
  Comte:     "1228796738987491449",
  Duc:       "1228797064444514396",
};

// --- Venerations: Rank N (1-12) -> Galons d'ancienneté (N*3 Months) role ID ---
const VENERATION_RANK_ROLES = {
  1:  "1193239194395476009",
  2:  "1193239194395476010",
  3:  "1193239194395476011",
  4:  "1193239194395476012",
  5:  "1193239194395476013",
  6:  "1193239194395476014",
  7:  "1193239194395476015",
  8:  "1193239194395476016",
  9:  "1193239194395476017",
  10: "1193239194429050931",
  11: "1193239194429050932",
  12: "1193239194429050933",
};

// --- Grandbattles: numeric rank 1-4 -> Grandbattle, {roman numeral} role ID ---
const GRANDBATTLE_RANK_ROLES = {
  1: "1520181388094210118",
  2: "1520181643351162961",
  3: "1520182675447480400",
  4: "1520203719814156391",
};

// --- MedalsRoster: (sheet H value, sheet I value) -> role ID.
// Keyed on the sheet's exact text (typos included, e.g. "Battaile"/"Initiaf"/
// "Pendantif") since that's what actually appears in the data — not the
// (differently-spelled) Discord role names. Roughly half the medal types that
// exist on this sheet have no corresponding role in this server at all; that's
// expected (this sheet is shared across multiple regiments/corps) and those
// rows are meant to be silently skipped, not treated as errors.
const MEDAL_ROLE_MAP = {
  "Légion d'Honneur": {
    "Légionnaire": "1193239194487750803",
    "Officier":    "1193239194487750804",
    "Commandeur":  "1193239194487750805",
  },
  "Ordre de la Fidèle": {
    "Légionnaire": "1193239194487750800",
    "Officier":    "1193239194487750801",
    "Commandeur":  "1193239194487750802",
  },
  "Ordre de la Couronne de Fer": {
    "Légionnaire": "1234215438058258463",
  },
  "Médaille du Mérite Commandant": {
    "de Bronze": "1193239194487750797",
    "d'Argent":  "1193239194487750798",
    "d'Or":      "1193239194487750799",
  },
  "Médaille du Mérite Initiaf": {
    "de Bronze": "1193239194458402834",
    "d'Argent":  "1193239194458402835",
    "d'Or":      "1193239194487750796",
  },
  "Médaille du Mérite Militaire": {
    "de Bronze": "1193239194458402831",
    "d'Argent":  "1193239194458402832",
    "d'Or":      "1193239194458402833",
  },
  "Médaille du Mérite Porte-Aigle": {
    "de Bronze": "1228805934654947379",
    "d'Argent":  "1228806452840370246",
    "d'Or":      "1228806572205936774",
  },
  "Médaille du Croix de Battaile": {
    "de Bronze": "1193239194458402828",
    "d'Argent":  "1193239194458402829",
    "d'Or":      "1193239194458402830",
  },
  "Médaille du Mérite en Recrutement": {
    "de Bronze": "1228797374563090572",
    "d'Argent":  "1228797401284739233",
    "d'Or":      "1228797408545079406",
  },
  "Médaille du Mérite Artistique": {
    "de Bronze": "1193239194429050940",
    "d'Argent":  "1193239194458402826",
    "d'Or":      "1193239194458402827",
  },
  // Only one role exists for these four — every class value seen on the sheet
  // maps to the same single role.
  "Médaille du Mérite Sociaux": {
    "d'Argent":  "1193239194429050939",
    "de Bronze": "1193239194429050939",
    "Officier":  "1193239194429050939",
    "d'Or":      "1193239194429050939",
  },
  "Médaille du Mérite Developpement": {
    "d'Argent":  "1193239194429050938",
    "de Bronze": "1193239194429050938",
  },
  "Médaille de l'Indéfectible": {
    "Légionnaire": "1193239194429050934",
    "de Bronze":   "1193239194429050934",
  },
  "Pendantif d'Elite": {
    "de Bronze": "1286989352664301580",
    "d'Argent":  "1286989352664301580",
    "d'Or":      "1286989352664301580",
  },
  "Médaille Campagne d'Autriche": {
    "de Bronze": "1228806825629974629",
    "d'Argent":  "1228807406033834039",
    "d'Or":      "1228807943273709688",
  },
  "Médaille Campagne d'Italie": {
    "de Bronze": "1397241040003665990",
    "d'Argent":  "1397241375564759140",
    "d'Or":      "1397241542627823716",
  },
  "Médaille de la Campagne d'Allemagne": {
    "de Bronze": "1419703311300431953",
    "d'Argent":  "1419703315729616987",
    "d'Or":      "1419703307768827954",
  },
  "Médaille du Mérite Alliance": {
    "de Bronze": "1193239194429050936",
    "d'Argent":  "1193239194429050937",
  },
  "Pendantif Benevole": {
    "de Bronze": "1193239194429050935",
    "d'Argent":  "1228805207970938880",
    "d'Or":      "1228805405564731422",
  },
};

// Strip the "{Name}, " prefix some unique Titres de Victoire rows carry in
// column I (e.g. "Orpios, Prince de Wagram") and return the exact title text
// to use as-is for the nickname suffix.
function extractNobilityTitle(rawValue) {
  const value = (rawValue ?? "").toString().trim();
  const commaIdx = value.indexOf(",");
  return commaIdx === -1 ? value : value.slice(commaIdx + 1).trim();
}

function detectNobilityTier(title) {
  for (const tier of ["Duc", "Comte", "Baron", "Chevalier"]) {
    if (new RegExp(`\\b${tier}\\b`, "i").test(title)) return tier;
  }
  return null;
}

// Fetches every in-scope row for `username` (case-insensitive against column D)
// across MedalsRoster/Venerations/Nobility/Grandbattles, filtered to only the
// statuses that currently count. Returns { medals, veneration, nobility, grandbattles }.
async function fetchHonoursForUsername(username) {
  const sheets = getSheetsClient();
  const tabs = Object.keys(RANGE_BY_TAB);

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: HONOURS_SHEET_ID,
    ranges: tabs.map((tab) => RANGE_BY_TAB[tab]),
  });

  const byTab = {};
  tabs.forEach((tab, i) => {
    byTab[tab] = res.data.valueRanges[i].values ?? [];
  });

  const target = username.trim().toLowerCase();
  const byUsername = (rows) =>
    rows.filter((r) => (r[0] ?? "").toString().trim().toLowerCase() === target);
  const validOnly = (rows, tab) =>
    rows.filter((r) => VALID_STATUS_BY_TAB[tab].has((r[6] ?? "").toString().trim()));

  const allMedalRows       = byUsername(byTab.MedalsRoster);
  const allVenerationRows  = byUsername(byTab.Venerations);
  const allNobilityRows    = byUsername(byTab.Nobility);
  const allGrandbattleRows = byUsername(byTab.Grandbattles);

  // "Found in the sheet at all" (any status) is distinct from "currently has
  // something valid" — a member with only Denied/Expired rows still exists on
  // the sheet and should NOT get the "nickname doesn't match" error.
  const foundInSheet = allMedalRows.length > 0 || allVenerationRows.length > 0 ||
                        allNobilityRows.length > 0 || allGrandbattleRows.length > 0;

  const medalRows       = validOnly(allMedalRows, "MedalsRoster");
  const venerationRows  = validOnly(allVenerationRows, "Venerations");
  const nobilityRows    = validOnly(allNobilityRows, "Nobility");
  const grandbattleRows = validOnly(allGrandbattleRows, "Grandbattles");

  // Medals: additive, collect every matched (H, I) -> role.
  const medalRoleIds = new Set();
  for (const row of medalRows) {
    const h = (row[4] ?? "").toString().trim();
    const i = (row[5] ?? "").toString().trim();
    const roleId = MEDAL_ROLE_MAP[h]?.[i];
    if (roleId) medalRoleIds.add(roleId);
  }

  // Venerations: current single highest rank found -> one Galons role.
  let venerationRoleId = null;
  let highestRank = 0;
  for (const row of venerationRows) {
    const rank = parseInt((row[5] ?? "").toString().trim(), 10);
    if (Number.isFinite(rank) && rank > highestRank && VENERATION_RANK_ROLES[rank]) {
      highestRank = rank;
      venerationRoleId = VENERATION_RANK_ROLES[rank];
    }
  }

  // Nobility: highest tier found (Duc > Comte > Baron > Chevalier) -> role + title text.
  const TIER_RANK = { Duc: 4, Comte: 3, Baron: 2, Chevalier: 1 };
  let nobility = null; // { roleId, title }
  for (const row of nobilityRows) {
    const title = extractNobilityTitle(row[5]);
    const tier  = detectNobilityTier(title);
    if (!tier) continue;
    if (!nobility || TIER_RANK[tier] > TIER_RANK[detectNobilityTier(nobility.title)]) {
      nobility = { roleId: NOBILITY_TIER_ROLES[tier], title };
    }
  }

  // Grandbattles: additive, one role per distinct rank found.
  const grandbattleRoleIds = new Set();
  for (const row of grandbattleRows) {
    const rank = parseInt((row[5] ?? "").toString().trim(), 10);
    const roleId = GRANDBATTLE_RANK_ROLES[rank];
    if (roleId) grandbattleRoleIds.add(roleId);
  }

  return {
    medalRoleIds:       [...medalRoleIds],
    venerationRoleId,
    nobility,
    grandbattleRoleIds: [...grandbattleRoleIds],
    foundInSheet,
  };
}

module.exports = {
  fetchHonoursForUsername,
  NOBILITY_TIER_ROLES,
  VENERATION_RANK_ROLES,
  GRANDBATTLE_RANK_ROLES,
  MEDAL_ROLE_MAP,
};
