const { SlashCommandBuilder } = require("discord.js");
const { getStats } = require("../sheets");

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

    return interaction.editReply({
      content: [
        `📊 **Regiment Stats — ${stats.username}**`,
        `> **Rank:** ${stats.rank}`,
        `> **Company:** ${stats.company}`,
        `> **KPE:** ${stats.kpe}`,
        `> **Activity:** ${stats.activity}`,
        `> **Total Kills:** ${stats.kills}`,
      ].join("\n"),
    });
  },
};
