const { SlashCommandBuilder } = require("discord.js");
const {
  removeUser, findUser, parseUsername, removeFromAllDepartments,
  getActiveAccountability, removeAccountability,
  findReserveUser, removeReserveUser,
  exileUser,
} = require("../sheets");
const { PROTECTED_ROLE_IDS } = require("../permissions");
const { buildExileEmbed } = require("../notifyEmbeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_exile")
    .setDescription("Permanently exile a member: remove from all sheets and blacklist them")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to exile").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for the exile").setRequired(true)
    ),

  async execute(interaction) {

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const reason = interaction.options.getString("reason").trim();
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    const displayName = parseUsername(targetMember.nickname ?? targetUser.username);

    // Find and clear them from wherever they're on file — enlisted, or on either reserve block
    const enlistRecord  = await findUser(targetUser.id);
    const reserveRecord = enlistRecord ? null : await findReserveUser(targetUser.id);

    let rank           = "N/A";
    let storedUsername = displayName;

    if (enlistRecord) {
      rank           = (enlistRecord.rowData[0] ?? "").toString().trim() || "N/A";
      storedUsername = (enlistRecord.rowData[2] ?? "").toString().trim() || displayName;
      await removeUser(targetUser.id);
      if (storedUsername) await removeFromAllDepartments(storedUsername);
    } else if (reserveRecord) {
      rank           = (reserveRecord.rowData[2] ?? "").toString().trim() || "N/A";
      storedUsername = (reserveRecord.rowData[1] ?? "").toString().trim() || displayName;
      await removeReserveUser(targetUser.id);
    }

    // Clear any active accountability record
    const accountability = await getActiveAccountability(targetUser.id);
    if (accountability) await removeAccountability(targetUser.id);

    // Blacklist them so they can never be re-enlisted or have commands run on them
    await exileUser({ userId: targetUser.id, username: storedUsername, rank, reason });

    // DM the target so they know why they were exiled
    const { embed, files } = buildExileEmbed({ reason, officerId: interaction.user.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    // Remove all roles except permanently protected ones
    const rolesToRemove = targetMember.roles.cache.filter(
      (role) => role.id !== interaction.guild.id && !PROTECTED_ROLE_IDS.has(role.id)
    );
    for (const [id] of rolesToRemove) {
      await targetMember.roles.remove(id).catch((err) =>
        console.error(`Failed to remove role ${id}:`, err.message)
      );
    }

    // Re-add guest role
    await targetMember.roles.add(process.env.GUEST_ROLE).catch((err) =>
      console.error("Failed to add guest role:", err.message)
    );

    // Strip [2.] from nickname
    const currentNick = targetMember.nickname ?? targetUser.username;
    const cleanNick   = currentNick.replace(/^\[2\.\]\s*/, "").trim();
    await targetMember.setNickname(cleanNick).catch((err) =>
      console.error("Failed to reset nickname:", err.message)
    );

    return interaction.editReply({
      content: `⛔ **${cleanNick}** has been exiled from the regiment.\n> Cleared from all sheets, including reserves. Roles reset, guest role restored.\n> **Former rank:** ${rank}\n> **Reason:** ${reason}\n> They cannot be re-enlisted or have any commands run on them until \`/user_clear_exile\` is used.`,
    });
  },
};
