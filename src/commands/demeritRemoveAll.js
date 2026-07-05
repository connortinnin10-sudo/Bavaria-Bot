const { SlashCommandBuilder } = require("discord.js");
const { removeAllDemerits } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("demerit_remove_all")
    .setDescription("Clear all demerits for every regiment member"),

  async execute(interaction) {

    const officerRoleId = process.env.DEMERIT_OFFICER_ROLE_ID;
    if (officerRoleId && !interaction.member.roles.cache.has(officerRoleId)) {
      return interaction.editReply({ content: "❌ You do not have permission to use this command." });
    }

    const affectedIds = await removeAllDemerits();

    for (const userId of affectedIds) {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) {
        await member.user.send("✅ Your demerits have been reset. You now have 0/3 demerits!").catch(() => null);
      }
    }

    return interaction.editReply({
      content: `✅ All demerits cleared. **${affectedIds.length}** member(s) reset.`,
    });
  },
};
