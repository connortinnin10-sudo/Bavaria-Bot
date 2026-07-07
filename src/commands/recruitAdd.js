const { SlashCommandBuilder } = require("discord.js");
const { findUser, incrementRecruitCount } = require("../sheets");
const { hasAnyRole } = require("../permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit_add")
    .setDescription("Add a recruitment tally for a Recruitment Department member")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The recruiter to tally").setRequired(true)
    ),

  async execute(interaction) {

    if (!hasAnyRole(interaction.member, process.env.ROLE_RECRUITMENT, process.env.ROLE_ETAT_MAJOR)) {
      return interaction.editReply({ content: "❌ You do not have permission to use this command." });
    }

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const username = (record.rowData[2] ?? "").toString().trim();
    const newCount = await incrementRecruitCount(username);

    if (newCount === null) {
      return interaction.editReply({
        content: `**${username}** was not found in the Recruitment Department.`,
      });
    }

    return interaction.editReply({
      content: `✅ Recruitment tally updated for **${username}**.\n> **Total recruits:** ${newCount}`,
    });
  },
};
