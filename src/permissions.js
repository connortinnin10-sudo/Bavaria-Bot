const PROTECTED_ROLE_IDS = new Set([
  "1193239194529714378", // Verified
  "1420175239429623858", // Merit Grade
  "1193239194571649051", // Permissions
  "1193239194571649044", // Designation
  "1239206838029783041", // Departments
  "1193239194529714381", // Awards
]);

const PROTECTED_RANKS = new Set([
  "Sergent",
  "Sergent Major",
  "Adjutant",
  "Adjutant Sous-Officier",
  "Sous-Lieutenant",
  "Lieutenant",
  "Capitaine",
  "Chef De Bataillon",
  "Major",
  "Colonel",
]);

// Enlisted rank role IDs (Conscript → Caporal-Fourrier), hardcoded per the Railway
// env-var pitfall. Officer ranks (Sergent+) are intentionally excluded: a member
// moved to reserve is demoted, so any officer rank role is stripped.
const ENLISTED_RANK_ROLE_IDS = [
  "1193239194571649053", // Conscript
  "1193239194600996994", // Soldat
  "1193239194600996995", // Soldat de Premier
  "1193239194600996997", // Caporal
  "1193239194600996998", // Caporal de Premier
  "1193239194600996999", // Caporal-Fourrier
];
// Caporal-Fourrier rank role — officers (Sergent+) are demoted to this rank when
// reserved, so /user_reserve re-adds it after the sweep strips their officer role.
const RANK_ROLE_CAPORAL_FOURRIER = "1193239194600996999";

// Bavaria Veteran role — added on top of the reserve role for members who were
// actively enlisted when moved to reserve (the veteran path in /user_reserve).
// ROLE_BAVARIAN_RESERVES (the reserve/"merc" role added to everyone) is declared
// further down alongside the other command-access role IDs.
const ROLE_BAVARIA_VETERAN   = "1530414516330827826";

// Extra reserve-grouping roles added to EVERY member on /user_reserve (alongside
// ROLE_BAVARIAN_RESERVES) and stripped again on the return paths (/transfer_company
// and /user_enlist). Hardcoded per the Railway pitfall.
const ROLE_MERCENARY              = "1203775751577407489"; // "Mercenary"
const ROLE_RESERVES_PREMIER_CORPS = "1234315658406269018"; // "Réserves du Premier Corps"
const RESERVE_EXTRA_ROLE_IDS = [ROLE_MERCENARY, ROLE_RESERVES_PREMIER_CORPS];

// /user_reserve strips every role a member holds EXCEPT these — the protected
// roles (Verified, medals/awards, permission meta-roles) and the enlisted rank
// roles. Managed roles (booster/integration) and @everyone are preserved by the
// command itself. Everything else — regiment, company, corps, army, Donauwörth,
// specialization, staff/command-access, and officer rank roles — is removed.
const RESERVE_KEEP_ROLE_IDS = new Set([...PROTECTED_ROLE_IDS, ...ENLISTED_RANK_ROLE_IDS]);

// Full rank hierarchy, lowest → highest. Used to gate specialization roles
// (e.g. Sapper/Drummer require Caporal de Premier or higher). Note the enlisted
// tiers use "Caporal de Premier" (space) but the top caporal tier is keyed
// "Caporal-Fourrier" (hyphen), matching the rest of the codebase.
const RANK_ORDER = [
  "Conscript",
  "Soldat",
  "Soldat de Premier",
  "Caporal",
  "Caporal de Premier",
  "Caporal-Fourrier",
  "Sergent",
  "Sergent Major",
  "Adjutant",
  "Adjutant Sous-Officier",
  "Sous-Lieutenant",
  "Lieutenant",
  "Capitaine",
  "Chef De Bataillon",
  "Major",
  "Colonel",
];

// True if `rank` sits at or above `minRank` in RANK_ORDER. An unknown rank string
// returns false, which safely blocks the gated action rather than allowing it.
function rankAtLeast(rank, minRank) {
  const r = RANK_ORDER.indexOf((rank ?? "").toString().trim());
  const m = RANK_ORDER.indexOf(minRank);
  return r !== -1 && m !== -1 && r >= m;
}

// ── Promotion points system ────────────────────────────────────────────────

// Master on/off switch for the whole promotion-points feature. Hardcoded (not an
// env var) per the Railway pitfall — flip to false + push to disable every entry
// point (point commands, transfer/reserve hooks, /current_promotions, the
// /my_stats bar) without removing code. Points data on the sheet is left intact.
const POINTS_SYSTEM_ENABLED = true;

// Points needed to promote FROM each rank to the next; points reset to 0 on
// promotion. Keyed by current rank. Only the enlisted ranks Soldat..Caporal de
// Premier have a threshold — Caporal-Fourrier is the top of the points ladder
// (promotions beyond it, into officer ranks, stay manual/discretionary).
const PROMOTION_THRESHOLDS = {
  "Soldat":             10, // → Soldat de Premier
  "Soldat de Premier":  15, // → Caporal
  "Caporal":            25, // → Caporal de Premier
  "Caporal de Premier": 35, // → Caporal-Fourrier
};

// Caporal-Fourrier is index 5 in RANK_ORDER — the ceiling for points-based
// promotion. nextRank returns null at/above it (or for an unknown rank), so the
// points system never promotes into the officer ranks (Sergent+).
const CAPORAL_FOURRIER_INDEX = 5;
function nextRank(rank) {
  const i = RANK_ORDER.indexOf((rank ?? "").toString().trim());
  if (i === -1 || i >= CAPORAL_FOURRIER_INDEX) return null;
  return RANK_ORDER[i + 1];
}

// Points required to promote from `rank`, or null when the rank has no threshold
// (Caporal-Fourrier and above, or an unrecognised rank) — i.e. the ladder ceiling.
function pointsForNextRank(rank) {
  return PROMOTION_THRESHOLDS[(rank ?? "").toString().trim()] ?? null;
}

// Hardcoded (not read from process.env) — Railway has silently dropped env vars
// before, which is why DEPT_ROLES and PROTECTED_ROLE_IDS were already moved here.
const COMPANY_ROLES = {
  Bayreuth:  "1193814561401344010",
  Schützen:  "1506735371353063555", // formerly "Rosenheim"; role ID unchanged
  Grenadier: "1193814779161215107",
};

// Donauwörth induction role — granted on /user_enlist (induction path), stripped
// when the member graduates to a company via /transfer_company.
const ROLE_DONAUWORTH = "1193814402592407582";

// Shared "Specialization" role carried by every specialist (Sapper, Drummer,
// Schützen) and by Grenadiers. Granted alongside the per-position role(s) below
// on /user_assign_specialization, and added on /transfer_company into Grenadier
// (removed on transfer out). Hardcoded (not env) per the Railway pitfall.
const ROLE_SPECIALIZATION = "1193815063480504370";

// Discord roles granted on /user_assign_specialization and stripped on
// /user_remove_specialization, keyed by position. Hardcoded (not env) for the
// same Railway reason as COMPANY_ROLES. A position may grant more than one role.
// Every position includes ROLE_SPECIALIZATION so the shared role is added/removed
// automatically with the position.
const SPECIALIZATION_ROLES = {
  Sapper:     ["1361485325708562432", "1193815223891669102", ROLE_SPECIALIZATION], // Corps Sapper, Regiment Sapper
  Drummer:    ["1382539832005365821", ROLE_SPECIALIZATION],                        // Drummer
};

const ROLE_ETAT_MAJOR        = "1193239194571649045"; // full access to every command
const ROLE_PETIT_ETAT_MAJOR  = "1197983145060990996";
const ROLE_DEPARTMENT_HEAD   = "1312900709888426075";
const ROLE_RECRUITMENT_STAFF = "1371578090186342502";
const ROLE_RECRUITMENT_DEPT  = "1224512938983952475";
const ROLE_REGIMENT          = "1530434376553332826"; // regiment role (new)
const ROLE_BAVARIAN_RESERVES = "1193239194529714382"; // formerly ROLE_REGIMENT — now Bavarian Reserves / "merc" (added to everyone on /user_reserve)

function hasAnyRole(member, ...roleIds) {
  const memberRoleIds = member._roles ?? [...member.roles.cache.keys()];
  const cleanIds = roleIds.filter(Boolean).map((id) => id.toString().trim());
  return cleanIds.some((id) => memberRoleIds.includes(id));
}

// État-Major always passes (enforced separately in index.js) — each entry here
// lists the *additional* roles allowed to run that command. Edit this object to
// change who can run what; it's the single source of truth for command access.
const COMMAND_PERMISSIONS = {
  user_enlist:         [ROLE_PETIT_ETAT_MAJOR, ROLE_RECRUITMENT_DEPT],
  user_reserve:        [ROLE_PETIT_ETAT_MAJOR],
  transfer_company:    [ROLE_PETIT_ETAT_MAJOR],
  user_rank_change:    [ROLE_PETIT_ETAT_MAJOR],
  user_add_point:      [ROLE_PETIT_ETAT_MAJOR],
  user_remove_point:   [ROLE_PETIT_ETAT_MAJOR],
  current_promotions:  [], // État-Major only — both running it and pressing Approve
  user_loa:            [ROLE_PETIT_ETAT_MAJOR],
  user_loa_remove:     [ROLE_PETIT_ETAT_MAJOR],
  demerit_add:         [ROLE_PETIT_ETAT_MAJOR],
  demerit_remove:      [ROLE_PETIT_ETAT_MAJOR, ROLE_DEPARTMENT_HEAD],

  user_add_platoon:    [ROLE_PETIT_ETAT_MAJOR],
  user_remove_platoon: [ROLE_PETIT_ETAT_MAJOR],
  add_event_points:    [ROLE_PETIT_ETAT_MAJOR],

  department_add:      [ROLE_DEPARTMENT_HEAD],

  recruit_add:         [ROLE_RECRUITMENT_STAFF],
  recruit_remove:      [ROLE_RECRUITMENT_STAFF],
  recruit_clear_sheet: [ROLE_RECRUITMENT_STAFF],

  // État-Major only — empty array, no additional roles granted.
  user_exile:          [],
  user_clear_exile:    [],
  demerit_remove_all:  [],
  department_remove:   [],
  user_assign_specialization: [],
  user_remove_specialization: [],

  my_stats:            [ROLE_REGIMENT],
  honours_sync:        [ROLE_REGIMENT],
};

module.exports = {
  PROTECTED_ROLE_IDS,
  PROTECTED_RANKS,
  RANK_ORDER,
  rankAtLeast,
  POINTS_SYSTEM_ENABLED,
  PROMOTION_THRESHOLDS,
  nextRank,
  pointsForNextRank,
  COMPANY_ROLES,
  ROLE_DONAUWORTH,
  SPECIALIZATION_ROLES,
  ROLE_SPECIALIZATION,
  ROLE_ETAT_MAJOR,
  ROLE_REGIMENT,
  ROLE_BAVARIAN_RESERVES,
  ROLE_BAVARIA_VETERAN,
  RESERVE_KEEP_ROLE_IDS,
  RANK_ROLE_CAPORAL_FOURRIER,
  RESERVE_EXTRA_ROLE_IDS,
  hasAnyRole,
  COMMAND_PERMISSIONS,
};
