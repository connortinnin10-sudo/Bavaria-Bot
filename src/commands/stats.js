const { SlashCommandBuilder } = require("discord.js");
const { getStats } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("my_stats")
    .setDescription("View your regiment stats"),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const statsRoleId = process.env.STATS_ROLE_ID;

    // Role check (temporarily disabled for testing)
    // if (!interaction.member.roles.cache.has(statsRoleId)) {
    //   return interaction.editReply("You do not have permission to use this command.");
    // }

    const stats = await getStats(interaction.user.id);

    if (!stats) {
      return interaction.editReply({
        content: "You are not found in the regiment records. Contact a recruiter.",
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
