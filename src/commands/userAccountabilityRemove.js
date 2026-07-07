const { SlashCommandBuilder } = require("discord.js");
const { removeAccountability, findUser } = require("../sheets");
const { hasAnyRole } = require("../permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_loa_remove")
    .setDescription("Remove a member from LOA")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to remove from LOA").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for removing the LOA").setRequired(true)
    ),

  async execute(interaction) {

    if (!hasAnyRole(interaction.member, process.env.ROLE_PETIT_ETAT_MAJOR, process.env.ROLE_ETAT_MAJOR)) {
      return interaction.editReply({ content: "❌ You do not have permission to use this command." });
    }

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });

    const reason  = (interaction.options.getString("reason") ?? "").trim();
    const record  = await findUser(targetUser.id);
    const username = record ? (record.rowData[2] ?? targetUser.username).toString().trim() : targetUser.username;

    const rowData = await removeAccountability(targetUser.id);

    if (!rowData) {
      return interaction.editReply({
        content: `**${username}** does not have an active accountability.`,
      });
    }

    await targetUser.send(`Your LOA has been removed.\n> **Reason:** ${reason}\n> **Removed by:** <@${interaction.user.id}>`).catch(() => null);

    return interaction.editReply({
      content: `✅ LOA removed for **${username}**.\n> **Reason:** ${reason}`,
    });
  },
};
