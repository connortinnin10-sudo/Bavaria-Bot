function hasAnyRole(member, ...roleIds) {
  return roleIds.some(id => id && member.roles.cache.has(id));
}

module.exports = { hasAnyRole };
