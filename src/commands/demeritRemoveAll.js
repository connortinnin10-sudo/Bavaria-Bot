const { SlashCommandBuilder } = require("discord.js");
const { removeAllDemerits } = require("../sheets");
const { hasAnyRole } = require("../permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("demerit_remove_all")
    .setDescription("Clear all demerits for every regiment member"),

  async execute(interaction) {

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
