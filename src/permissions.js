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

// Hardcoded (not read from process.env) — Railway has silently dropped env vars
// before, which is why DEPT_ROLES and PROTECTED_ROLE_IDS were already moved here.
const COMPANY_ROLES = {
  Bayreuth:  "1193814561401344010",
  Rosenheim: "1506735371353063555",
};

module.exports = { PROTECTED_ROLE_IDS, PROTECTED_RANKS, COMPANY_ROLES };
