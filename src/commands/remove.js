const { SlashCommandBuilder } = require("discord.js");
const { removeUser } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a recruit from the regiment records")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to remove").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const recruitmentRoleId = process.env.RECRUITMENT_ROLE_ID;

    // Role check (temporarily disabled for testing)
    // if (!interaction.member.roles.cache.has(recruitmentRoleId)) {
    //   return interaction.editReply("You do not have permission to use this command.");
    // }

    const targetUser   = interaction.options.getUser("user");
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: `Could not find that member in this server.` });
    }

    // 1. Clean off the sheet
    const removed = await removeUser(targetUser.id);
    if (!removed) {
      return interaction.editReply({
        content: `**${targetMember.displayName}** was not found in the regiment records.`,
      });
    }

    // 2. Remove all roles except the ones to keep
    const keepRoles = new Set(process.env.REMOVE_KEEP_ROLES.split(",").map((r) => r.trim()));
    const rolesToRemove = targetMember.roles.cache.filter(
      (role) => role.id !== interaction.guild.id && !keepRoles.has(role.id)
    );
    for (const [id] of rolesToRemove) {
      await targetMember.roles.remove(id).catch((err) =>
        console.error(`Failed to remove role ${id}:`, err.message)
      );
    }

    // 3. Re-add guest role
    await targetMember.roles.add(process.env.GUEST_ROLE).catch((err) =>
      console.error("Failed to add guest role:", err.message)
    );

    // 4. Strip [2.] from nickname
    const currentNick = targetMember.nickname ?? targetUser.username;
    const cleanNick   = currentNick.replace(/^\[2\.\]\s*/, "").trim();
    await targetMember.setNickname(cleanNick).catch((err) =>
      console.error("Failed to reset nickname:", err.message)
    );

    return interaction.editReply({
      content: `✅ **${cleanNick}** has been removed from the regiment.\n> Roles cleared, guest role restored, nickname reset.`,
    });
  },
};
