const { SlashCommandBuilder } = require("discord.js");
const { getStats } = require("../sheets");
const { buildPersonalStatsEmbed } = require("../statsEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my_stats")
    .setDescription("View your regiment stats"),
  ephemeral: false,

  async execute(interaction) {

    const stats = await getStats(interaction.user.id);

    if (!stats) {
      return interaction.editReply({
        content: "❌ You are not found in the regiment records. Contact a recruiter.",
      });
    }

    const { embed, files } = buildPersonalStatsEmbed(stats);

    return interaction.editReply({ embeds: [embed], files });
  },
};
