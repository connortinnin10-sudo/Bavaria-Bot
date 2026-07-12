const { SlashCommandBuilder } = require("discord.js");
const { findUser, getDemeritCount, addDemerit } = require("../sheets");
const { buildDemeritAddEmbed } = require("../notifyEmbeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("demerit_add")
    .setDescription("Issue a demerit to a regiment member")
    .addUserOption(opt =>
      opt.setName("user").setDescription("The member to demerit").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("reason").setDescription("Reason for the demerit").setRequired(true)
    ),

  async execute(interaction) {

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const reason = interaction.options.getString("reason").trim();

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({ content: "❌ That user is not found in the regiment records." });
    }

    const currentCount = await getDemeritCount(targetUser.id);
    if (currentCount >= 3) {
      return interaction.editReply({ content: `❌ **${record.rowData[2]}** already has 3/3 demerits.` });
    }

    const newCount = await addDemerit(targetUser.id, reason, interaction.user.id);
    const username = (record.rowData[2] ?? targetUser.username).toString();

    const { embed, files } = buildDemeritAddEmbed({ count: newCount, reason, officerId: interaction.user.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ Demerit issued to **${username}**.\n> **Demerits:** ${newCount}/3\n> **Reason:** ${reason}`,
    });
  },
};
