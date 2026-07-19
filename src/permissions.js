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

// Hardcoded (not read from process.env) — Railway has silently dropped env vars
// before, which is why DEPT_ROLES and PROTECTED_ROLE_IDS were already moved here.
const COMPANY_ROLES = {
  Bayreuth:  "1193814561401344010",
  Rosenheim: "1506735371353063555",
  Grenadier: "1193814779161215107",
};

// Donauwörth induction role — granted on /user_enlist (induction path), stripped
// when the member graduates to a company via /transfer_company.
const ROLE_DONAUWORTH = "1193814402592407582";

// Discord roles granted on /user_assign_specialization and stripped on
// /user_remove_specialization, keyed by position. Hardcoded (not env) for the
// same Railway reason as COMPANY_ROLES. A position may grant more than one role.
const SPECIALIZATION_ROLES = {
  Sapper:     ["1361485325708562432", "1193815223891669102"], // Corps Sapper, Regiment Sapper
  Drummer:    ["1382539832005365821"],                        // Drummer
  "Schützen": ["1443331846401167533"],                        // Schützen
};

const ROLE_ETAT_MAJOR        = "1193239194571649045"; // full access to every command
const ROLE_PETIT_ETAT_MAJOR  = "1197983145060990996";
const ROLE_DEPARTMENT_HEAD   = "1312900709888426075";
const ROLE_RECRUITMENT_STAFF = "1371578090186342502";
const ROLE_RECRUITMENT_DEPT  = "1224512938983952475";
const ROLE_REGIMENT          = "1193239194529714382";

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
  add_to_regiment:     [ROLE_PETIT_ETAT_MAJOR],
  user_reserve:        [ROLE_PETIT_ETAT_MAJOR],
  transfer_company:    [ROLE_PETIT_ETAT_MAJOR],
  user_rank_change:    [ROLE_PETIT_ETAT_MAJOR],
  user_loa:            [ROLE_PETIT_ETAT_MAJOR],
  user_loa_remove:     [ROLE_PETIT_ETAT_MAJOR],
  demerit_add:         [ROLE_PETIT_ETAT_MAJOR],
  demerit_remove:      [ROLE_PETIT_ETAT_MAJOR, ROLE_DEPARTMENT_HEAD],

  "add_recruitment-department": [ROLE_DEPARTMENT_HEAD],
  "add_propaganda-department":  [ROLE_DEPARTMENT_HEAD],
  "add_flag-department":        [ROLE_DEPARTMENT_HEAD],

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
  COMPANY_ROLES,
  ROLE_DONAUWORTH,
  SPECIALIZATION_ROLES,
  ROLE_ETAT_MAJOR,
  hasAnyRole,
  COMMAND_PERMISSIONS,
};
