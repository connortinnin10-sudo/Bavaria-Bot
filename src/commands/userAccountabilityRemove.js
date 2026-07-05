const { SlashCommandBuilder } = require("discord.js");
const { removeAccountability, findUser } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_accountability_remove")
    .setDescription("Remove a member from accountability")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to remove from accountability").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });

    const record   = await findUser(targetUser.id);
    const username = record ? (record.rowData[2] ?? targetUser.username).toString().trim() : targetUser.username;

    const found = await removeAccountability(targetUser.id);

    if (!found) {
      return interaction.editReply({
        content: `**${username}** does not have an active accountability.`,
      });
    }

    return interaction.editReply({
      content: `✅ Accountability removed for **${username}**. Their sheet has been restored.`,
    });
  },
};
