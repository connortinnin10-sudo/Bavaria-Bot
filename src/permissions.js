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

module.exports = { hasAnyRole };
