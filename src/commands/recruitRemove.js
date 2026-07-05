const { SlashCommandBuilder } = require("discord.js");
const { findUser, decrementRecruitCount } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit_remove")
    .setDescription("Remove one recruitment tally from a Recruitment Department member")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The recruiter to remove a tally from").setRequired(true)
    ),

  async execute(interaction) {

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const username = (record.rowData[2] ?? "").toString().trim();
    const newCount = await decrementRecruitCount(username);

    if (newCount === null) {
      return interaction.editReply({
        content: `**${username}** was not found in the Recruitment Department.`,
      });
    }

    return interaction.editReply({
      content: `✅ Recruitment tally reduced for **${username}**.\n> **Total recruits:** ${newCount}`,
    });
  },
};
