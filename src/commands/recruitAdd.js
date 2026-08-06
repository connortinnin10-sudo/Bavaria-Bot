const { SlashCommandBuilder } = require("discord.js");
const { findUser, incrementRecruitCount, awardPoints } = require("../sheets");
const { POINTS_SYSTEM_ENABLED } = require("../permissions");
const { buildRecruitLoggedEmbed } = require("../notifyEmbeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recruit_add")
    .setDescription("Add a recruitment tally for a Recruitment Department member")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The recruiter to tally").setRequired(true)
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
    const newCount = await incrementRecruitCount(username);

    if (newCount === null) {
      return interaction.editReply({
        content: `**${username}** was not found in the Recruitment Department.`,
      });
    }

    // Award 1 promotion point for the logged recruit + DM the recruiter. Company
    // members only (awardPoints enforces that); the tally already succeeded regardless.
    let pointAwarded = false;
    if (POINTS_SYSTEM_ENABLED) {
      const res = await awardPoints(targetUser.id, 1).catch(() => null);
      if (res && res.status === "ok") {
        pointAwarded = true;
        const { embed, files } = buildRecruitLoggedEmbed();
        await targetUser.send({ embeds: [embed], files }).catch(() => null);
      }
    }

    return interaction.editReply({
      content: `✅ Recruitment tally updated for **${username}**.\n> **Total recruits:** ${newCount}` +
               (pointAwarded ? "\n> **+1 promotion point** awarded." : ""),
    });
  },
};
