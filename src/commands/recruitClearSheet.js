const { SlashCommandBuilder } = require("discord.js");
const { clearRecruitSheet } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit_clear_sheet")
    .setDescription("Clear all recruitment tallies for everyone in the Recruitment Department"),

  async execute(interaction) {
    await clearRecruitSheet();

    return interaction.editReply({
      content: "✅ All recruitment tallies have been cleared.",
    });
  },
};
