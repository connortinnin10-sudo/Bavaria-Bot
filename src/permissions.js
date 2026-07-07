const PROTECTED_ROLE_IDS = new Set([
  "1193239194529714378", // Verified
  "1420175239429623858", // Merit Grade
  "1193239194571649051", // Permissions
  "1193239194571649044", // Designation
  "1239206838029783041", // Departments
  "1193239194529714381", // Awards
]);

function hasAnyRole(member, ...roleIds) {
  // _roles is the raw role ID array from the gateway — never filtered through guild.roles.cache
  const memberRoleIds = member._roles ?? [...member.roles.cache.keys()];
  const cleanIds = roleIds.filter(Boolean).map(id => id.toString().trim());
  const result = cleanIds.some(id => memberRoleIds.includes(id));
  if (!result) {
    console.log(`[hasAnyRole] BLOCKED | member: ${memberRoleIds.join(",")} | checking: ${cleanIds.join(",")}`);
  }
  return result;
}

module.exports = { hasAnyRole, PROTECTED_ROLE_IDS };
