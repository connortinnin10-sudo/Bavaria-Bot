const { SlashCommandBuilder } = require("discord.js");
const { parseUsername } = require("../sheets");
const {
  fetchHonoursForUsername,
  NOBILITY_TIER_ROLES,
  VENERATION_RANK_ROLES,
  GRANDBATTLE_RANK_ROLES,
  MEDAL_ROLE_MAP,
} = require("../honoursSheet");

// Every role this command could ever grant — used to know which currently-held
// roles are "ours" to remove when they're no longer earned. Never touches any
// role outside this set.
const MANAGED_ROLE_IDS = new Set([
  ...Object.values(NOBILITY_TIER_ROLES),
  ...Object.values(VENERATION_RANK_ROLES),
  ...Object.values(GRANDBATTLE_RANK_ROLES),
  ...Object.values(MEDAL_ROLE_MAP).flatMap((tiers) => Object.values(tiers)),
]);

function buildNickname(currentNickname, fallbackUsername, title) {
  const base = (currentNickname ?? fallbackUsername).split(",")[0].trim();
  return title ? `${base}, ${title}` : base;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("honours_sync")
    .setDescription("Sync your medal, veneration, nobility, and grandbattle roles from the honours sheet"),

  async execute(interaction) {
    const member   = await interaction.guild.members.fetch(interaction.user.id);
    const username = parseUsername(member.nickname ?? interaction.user.username);

    const honours = await fetchHonoursForUsername(username);

    if (!honours.foundInSheet) {
      return interaction.editReply({
        content: `❌ Could not find **${username}** on the honours sheet. Your Discord nickname must match your Roblox username exactly (case doesn't matter, but everything else does).`,
      });
    }

    const targetRoleIds = new Set([
      ...honours.medalRoleIds,
      ...honours.grandbattleRoleIds,
    ]);
    if (honours.venerationRoleId) targetRoleIds.add(honours.venerationRoleId);
    if (honours.nobility)         targetRoleIds.add(honours.nobility.roleId);

    const currentRoleIds = new Set(member._roles ?? [...member.roles.cache.keys()]);

    const rolesToAdd    = [...targetRoleIds].filter((id) => !currentRoleIds.has(id));
    const rolesToRemove = [...MANAGED_ROLE_IDS].filter(
      (id) => currentRoleIds.has(id) && !targetRoleIds.has(id)
    );

    if (rolesToAdd.length > 0) {
      await member.roles.add(rolesToAdd).catch((err) =>
        console.error("honours_sync: failed to add roles:", err.message)
      );
    }
    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove).catch((err) =>
        console.error("honours_sync: failed to remove roles:", err.message)
      );
    }

    const newNickname = buildNickname(member.nickname, interaction.user.username, honours.nobility?.title);
    let nicknameChanged = false;
    if (newNickname !== (member.nickname ?? interaction.user.username)) {
      await member.setNickname(newNickname).catch((err) =>
        console.error("honours_sync: failed to set nickname:", err.message)
      );
      nicknameChanged = true;
    }

    if (rolesToAdd.length === 0 && rolesToRemove.length === 0 && !nicknameChanged) {
      return interaction.editReply({ content: "✅ You're already up to date — no changes needed." });
    }

    const lines = ["✅ **Honours synced.**"];
    if (rolesToAdd.length > 0)    lines.push(`> Added ${rolesToAdd.length} role(s).`);
    if (rolesToRemove.length > 0) lines.push(`> Removed ${rolesToRemove.length} role(s) no longer earned.`);
    if (nicknameChanged)          lines.push(`> Nickname updated to **${newNickname}**.`);

    return interaction.editReply({ content: lines.join("\n") });
  },
};
