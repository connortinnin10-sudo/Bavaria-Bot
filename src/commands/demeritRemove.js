const { SlashCommandBuilder } = require("discord.js");
const { findUser, removeDemerit } = require("../sheets");
const { buildDemeritRemoveEmbed } = require("../notifyEmbeds");

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

    const { embed, files } = buildDemeritRemoveEmbed({ count: newCount, reason, officerId: interaction.user.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ Demerit removed from **${username}**.\n> **Demerits:** ${newCount}/3\n> **Reason:** ${reason}`,
    });
  },
};
