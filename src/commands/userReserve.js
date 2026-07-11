const { SlashCommandBuilder } = require("discord.js");
const { findUser, removeUser, removeFromAllDepartments, findReserveUser, reserveUser, parseUsername } = require("../sheets");
const { PROTECTED_ROLE_IDS } = require("../permissions");

const DEPT_ROLES = {
  "Recruitment Department": "1224512938983952475",
  "Propaganda Department":  "1224513613377568889",
  "Flag Department":        "1193815658182492191",
};

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

    // If currently enlisted, carry their rank over as a veteran; otherwise mercenary
    const enlistRecord = await findUser(targetUser.id);
    let type, rank;
    if (enlistRecord) {
      type = "veteran";
      rank = (enlistRecord.rowData[0] ?? "").toString().trim() || "Soldat";
      const storedUsername = (enlistRecord.rowData[2] ?? "").toString().trim();
      await removeUser(targetUser.id);
      if (storedUsername) await removeFromAllDepartments(storedUsername);
    } else {
      type = "mercenary";
      rank = "Soldat";
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

    // Strip all department roles, same as a full regiment removal would
    for (const roleId of Object.values(DEPT_ROLES)) {
      await targetMember.roles.remove(roleId).catch((err) =>
        console.error(`Failed to remove department role ${roleId}:`, err.message)
      );
    }

    // TODO (future work, required — not abandoned): /user_reserve needs veteran/mercenary-specific
    // role add/remove logic. RESERVE_ROLES_REMOVE / RESERVE_ROLES_ADD env vars don't exist anywhere
    // today, so this block is currently a no-op. Do not delete — will be replaced once role
    // requirements per reserve type are defined.
    const rolesToRemove = (process.env.RESERVE_ROLES_REMOVE ?? "").split(",").map(r => r.trim()).filter(id => id && !PROTECTED_ROLE_IDS.has(id));
    for (const roleId of rolesToRemove) {
      await targetMember.roles.remove(roleId).catch((err) =>
        console.error(`Failed to remove role ${roleId}:`, err.message)
      );
    }

    const rolesToAdd = (process.env.RESERVE_ROLES_ADD ?? "").split(",").map(r => r.trim()).filter(Boolean);
    for (const roleId of rolesToAdd) {
      await targetMember.roles.add(roleId).catch((err) =>
        console.error(`Failed to add role ${roleId}:`, err.message)
      );
    }

    // Set nickname to plain username (no [2.] prefix)
    await targetMember.setNickname(username).catch((err) =>
      console.error("Failed to set nickname:", err.message)
    );

    // TODO (future, user will provide more detail): expand this DM with more context once
    // available — do not build this out further now.
    await targetUser.send(`You were moved to reserves by <@${interaction.user.id}>.`).catch(() => null);

    return interaction.editReply({
      content: `✅ **${username}** has been moved to the ${type} reserve roster.\n> **Rank on file:** ${rank}\n> ${enlistRecord ? "Removed from regiment sheet and departments." : "Was not on the active roster."}`,
    });
  },
};
