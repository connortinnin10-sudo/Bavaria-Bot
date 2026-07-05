const { SlashCommandBuilder } = require("discord.js");
const { findUser, removeUser, removeFromAllDepartments, findReserveUser, reserveUser } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_reserve")
    .setDescription("Move a member to the reserve roster")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to move to reserve").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("username").setDescription("Their Roblox username").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("timezone").setDescription("Their timezone (e.g. EST, GMT+1)").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const username     = interaction.options.getString("username").trim();
    const timezone     = interaction.options.getString("timezone").trim();
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    // Block if already on reserve
    const existingReserve = await findReserveUser(targetUser.id);
    if (existingReserve) {
      return interaction.editReply({
        content: `**${username}** is already on the reserve roster.`,
      });
    }

    // If on enlist sheet, wipe them and their departments
    const enlistRecord = await findUser(targetUser.id);
    if (enlistRecord) {
      const storedUsername = (enlistRecord.rowData[2] ?? "").toString().trim();
      await removeUser(targetUser.id);
      if (storedUsername) await removeFromAllDepartments(storedUsername);
    }

    // Write to reserve sheet
    try {
      await reserveUser({ userId: targetUser.id, timezone, username });
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({ content: "❌ The reserve roster is full. No available slots." });
      }
      throw err;
    }

    // Remove regiment roles
    const rolesToRemove = (process.env.RESERVE_ROLES_REMOVE ?? "").split(",").map(r => r.trim()).filter(Boolean);
    for (const roleId of rolesToRemove) {
      await targetMember.roles.remove(roleId).catch((err) =>
        console.error(`Failed to remove role ${roleId}:`, err.message)
      );
    }

    // Add reserve roles
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

    return interaction.editReply({
      content: `✅ **${username}** has been moved to the reserve roster.\n> **Timezone:** ${timezone}\n> ${enlistRecord ? "Removed from regiment sheet and departments." : "Was not on the active roster."}`,
    });
  },
};
