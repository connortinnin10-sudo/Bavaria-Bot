const { SlashCommandBuilder } = require("discord.js");
const { getStats } = require("../sheets");
const { hasAnyRole } = require("../permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my_stats")
    .setDescription("View your regiment stats"),
  ephemeral: false,

  async execute(interaction) {

    if (!hasAnyRole(interaction.member, process.env.ROLE_REGIMENT)) {
      return interaction.editReply({ content: "❌ You do not have permission to use this command." });
    }

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
