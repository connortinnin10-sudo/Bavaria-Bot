const { SlashCommandBuilder } = require("discord.js");
const { removeUser, findUser, parseUsername, removeFromAllDepartments } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_remove")
    .setDescription("Remove a member from the regiment and all sheets")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to remove").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    // Role check (temporarily disabled for testing)
    // if (!interaction.member.roles.cache.has(process.env.RECRUITMENT_ROLE_ID)) {
    //   return interaction.editReply("You do not have permission to use this command.");
    // }

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    // Get their stored username before wiping the sheet
    const enlistRecord = await findUser(targetUser.id);
    if (!enlistRecord) {
      return interaction.editReply({
        content: `**${parseUsername(targetMember.nickname ?? targetUser.username)}** was not found in the regiment records.`,
      });
    }
    const storedUsername = (enlistRecord.rowData[2] ?? "").toString().trim();

    // 1. Remove from enlist sheet (Bayreuth or Rosenheim)
    await removeUser(targetUser.id);

    // 2. Remove from all department sheets by username
    if (storedUsername) {
      await removeFromAllDepartments(storedUsername);
    }

    // 3. Remove all roles except protected ones
    const keepRoles = new Set(process.env.REMOVE_KEEP_ROLES.split(",").map((r) => r.trim()));
    const rolesToRemove = targetMember.roles.cache.filter(
      (role) => role.id !== interaction.guild.id && !keepRoles.has(role.id)
    );
    for (const [id] of rolesToRemove) {
      await targetMember.roles.remove(id).catch((err) =>
        console.error(`Failed to remove role ${id}:`, err.message)
      );
    }

    // 4. Re-add guest role
    await targetMember.roles.add(process.env.GUEST_ROLE).catch((err) =>
      console.error("Failed to add guest role:", err.message)
    );

    // 5. Strip [2.] from nickname
    const currentNick = targetMember.nickname ?? targetUser.username;
    const cleanNick   = currentNick.replace(/^\[2\.\]\s*/, "").trim();
    await targetMember.setNickname(cleanNick).catch((err) =>
      console.error("Failed to reset nickname:", err.message)
    );

    return interaction.editReply({
      content: `✅ **${cleanNick}** has been removed from the regiment.\n> Cleared from all sheets, roles reset, guest role restored, nickname reset.`,
    });
  },
};
