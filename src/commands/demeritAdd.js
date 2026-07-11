const { SlashCommandBuilder } = require("discord.js");
const { findUser, getDemeritCount, addDemerit } = require("../sheets");

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

    let dmText;
    if (newCount >= 3) {
      dmText = [
        `⚠️ You have received demerit **3/3** for: *${reason}*`,
        `You've received 3/3 demerits. You're currently pending to be transferred to the regiment's reserve company. To contest this, contact <@${interaction.user.id}>.`,
      ].join("\n");
    } else {
      dmText = [
        `⚠️ You have received demerit **${newCount}/3** for: *${reason}*`,
        `To contest this demerit, contact <@${interaction.user.id}>.`,
      ].join("\n");
    }
    await targetUser.send(dmText).catch(() => null);

    return interaction.editReply({
      content: `✅ Demerit issued to **${username}**.\n> **Demerits:** ${newCount}/3\n> **Reason:** ${reason}`,
    });
  },
};
