const { SlashCommandBuilder } = require("discord.js");
const { clearRecruitSheet } = require("../sheets");
const { hasAnyRole } = require("../permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit_clear_sheet")
    .setDescription("Clear all recruitment tallies for everyone in the Recruitment Department"),

  async execute(interaction) {
    if (!hasAnyRole(interaction.member, process.env.ROLE_RECRUITMENT, process.env.ROLE_ETAT_MAJOR)) {
      return interaction.editReply({ content: "❌ You do not have permission to use this command." });
    }

    await clearRecruitSheet();

    return interaction.editReply({
      content: "✅ All recruitment tallies have been cleared.",
    });
  },
};
