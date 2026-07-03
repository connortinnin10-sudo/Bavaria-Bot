const { SlashCommandBuilder } = require("discord.js");
const { removeAccountability } = require("../sheets");

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
    const found = await removeAccountability(targetUser.id);

    if (!found) {
      return interaction.editReply({
        content: `**${targetUser.username}** does not have an active accountability.`,
      });
    }

    return interaction.editReply({
      content: `✅ Accountability removed for **${targetUser.username}**. Their sheet has been restored.`,
    });
  },
};
