const { SlashCommandBuilder } = require("discord.js");
const { findUser, removeUser, removeFromAllDepartments, findReserveUser, reserveUser, parseUsername } = require("../sheets");
const { PROTECTED_RANKS, RESERVE_KEEP_ROLE_IDS, ROLE_BAVARIAN_RESERVES, ROLE_BAVARIA_VETERAN, RANK_ROLE_CAPORAL_FOURRIER } = require("../permissions");
const { buildVeteranReserveEmbed, buildMercenaryReserveEmbed } = require("../welcomeEmbed");
const { HONOUR_ROLE_IDS } = require("../honoursSheet");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_reserve")
    .setDescription("Move a member to the reserve roster")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to move to reserve").setRequired(true)
    ),

  async execute(interaction) {

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    const username = parseUsername(targetMember.nickname ?? targetUser.username);

    // Block if already on reserve, either type
    const existingReserve = await findReserveUser(targetUser.id);
    if (existingReserve) {
      return interaction.editReply({
        content: `**${username}** is already on the ${existingReserve.type} reserve roster.`,
      });
    }

    // Veteran status only applies to Soldat+ members (rank carried over, locked).
    // Conscripts — including trial members sitting in Donauwörth — and anyone not
    // currently enlisted go to the mercenary block at the Conscript rank.
    const enlistRecord = await findUser(targetUser.id);
    const currentRank  = enlistRecord ? (enlistRecord.rowData[0] ?? "").toString().trim() : "";
    let type, rank;
    if (enlistRecord && currentRank && currentRank !== "Conscript") {
      type = "veteran";
      rank = currentRank;
      if (PROTECTED_RANKS.has(rank)) rank = "Caporal-Fourrier";
    } else {
      type = "mercenary";
      rank = "Conscript";
    }
    // Clear their active roster row + departments either way, if they were enlisted.
    if (enlistRecord) {
      const storedUsername = (enlistRecord.rowData[2] ?? "").toString().trim();
      await removeUser(targetUser.id);
      if (storedUsername) await removeFromAllDepartments(storedUsername);
    }

    // Write to reserve sheet
    try {
      await reserveUser({ userId: targetUser.id, username, rank, type });
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({ content: "❌ The reserve roster is full. No available slots." });
      }
      throw err;
    }

    // Strip every role EXCEPT the reserve keep-list (protected roles + enlisted
    // rank roles), earned honour roles (medals/nobility/veneration/grandbattle),
    // and managed roles (booster/integration roles can't be removed). One sweep
    // clears the regiment, company, corps/army, Donauwörth, department,
    // specialization, staff, and officer-rank roles. @everyone is skipped.
    const rolesToRemove = targetMember.roles.cache.filter(
      (role) =>
        role.id !== interaction.guild.id &&
        !role.managed &&
        !RESERVE_KEEP_ROLE_IDS.has(role.id) &&
        !HONOUR_ROLE_IDS.has(role.id)
    );
    for (const roleId of rolesToRemove.keys()) {
      await targetMember.roles.remove(roleId).catch((err) =>
        console.error(`Failed to remove role ${roleId}:`, err.message)
      );
    }

    // Add the reserve role to everyone; veterans (members who were actively
    // enlisted when reserved) additionally get the Bavaria Veteran role.
    const rolesToAdd = [ROLE_BAVARIAN_RESERVES];
    if (type === "veteran") {
      rolesToAdd.push(ROLE_BAVARIA_VETERAN);
      // Officers (Sergent+) are capped to Caporal-Fourrier on the sheet and had
      // their officer rank role stripped by the sweep — assign the cpl-f role so
      // Discord matches. (Genuine cpl-f veterans already hold it; re-add is a no-op.)
      if (rank === "Caporal-Fourrier") rolesToAdd.push(RANK_ROLE_CAPORAL_FOURRIER);
    }
    for (const roleId of rolesToAdd) {
      await targetMember.roles.add(roleId).catch((err) =>
        console.error(`Failed to add role ${roleId}:`, err.message)
      );
    }

    // Keep the [2.] prefix — reserves stay tagged as regiment members.
    await targetMember.setNickname(`[2.] ${username}`).catch((err) =>
      console.error("Failed to set nickname:", err.message)
    );

    // DM the appropriate reserve welcome embed based on type
    const { embed, files } = type === "veteran"
      ? buildVeteranReserveEmbed({ userId: targetUser.id })
      : buildMercenaryReserveEmbed({ userId: targetUser.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ **${username}** has been moved to the ${type} reserve roster.\n> **Rank on file:** ${rank}\n> ${enlistRecord ? "Removed from regiment sheet and departments." : "Was not on the active roster."}`,
    });
  },
};
