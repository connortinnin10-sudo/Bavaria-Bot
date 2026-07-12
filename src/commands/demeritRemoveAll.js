const { SlashCommandBuilder } = require("discord.js");
const { removeAllDemerits } = require("../sheets");
const { buildDemeritResetEmbed } = require("../notifyEmbeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("demerit_remove_all")
    .setDescription("Clear all demerits for every regiment member"),

  async execute(interaction) {

    const affectedIds = await removeAllDemerits();

    for (const userId of affectedIds) {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) {
        const { embed, files } = buildDemeritResetEmbed();
        await member.user.send({ embeds: [embed], files }).catch(() => null);
      }
    }

    return interaction.editReply({
      content: `✅ All demerits cleared. **${affectedIds.length}** member(s) reset.`,
    });
  },
};
