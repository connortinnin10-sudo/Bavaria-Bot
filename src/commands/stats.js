const { SlashCommandBuilder } = require("discord.js");
const { getStats, getPromotionProgress } = require("../sheets");
const { buildPersonalStatsEmbed } = require("../statsEmbed");
const { POINTS_SYSTEM_ENABLED } = require("../permissions");

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

    // Real promotion-points progress drives the bar when the system is on and the
    // member has a profile; a read failure or no profile falls back to career-tier.
    const progress = POINTS_SYSTEM_ENABLED
      ? await getPromotionProgress(interaction.user.id).catch(() => null)
      : null;

    const { embed, files } = buildPersonalStatsEmbed(stats, progress);

    return interaction.editReply({ embeds: [embed], files });
  },
};
