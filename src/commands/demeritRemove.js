const { SlashCommandBuilder } = require("discord.js");
const { findUser, removeDemerit } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("demerit_remove")
    .setDescription("Remove a demerit from a regiment member")
    .addUserOption(opt =>
      opt.setName("user").setDescription("The member to remove a demerit from").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("reason").setDescription("Reason for removing the demerit").setRequired(true)
    ),

  async execute(interaction) {

    const officerRoleId = process.env.DEMERIT_OFFICER_ROLE_ID;
    if (officerRoleId && !interaction.member.roles.cache.has(officerRoleId)) {
      return interaction.editReply({ content: "❌ You do not have permission to use this command." });
    }

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const reason     = interaction.options.getString("reason").trim();

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({ content: "❌ That user is not found in the regiment records." });
    }

    const username = (record.rowData[2] ?? targetUser.username).toString();
    const newCount = await removeDemerit(targetUser.id);

    if (newCount === null) {
      return interaction.editReply({ content: `❌ **${username}** has no demerits to remove.` });
    }

    const dmText = newCount === 0
      ? `✅ A demerit has been removed for: *${reason}*. You now have no demerits.`
      : `✅ A demerit has been removed for: *${reason}*. You are now at **${newCount}/3** demerits.`;
    await targetUser.send(dmText).catch(() => null);

    return interaction.editReply({
      content: `✅ Demerit removed from **${username}**.\n> **Demerits:** ${newCount}/3\n> **Reason:** ${reason}`,
    });
  },
};
