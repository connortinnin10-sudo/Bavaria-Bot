const { SlashCommandBuilder } = require("discord.js");
const { clearExile } = require("../sheets");
const { buildExileClearedEmbed } = require("../notifyEmbeds");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_clear_exile")
    .setDescription("Clear a member's exile so they can be enlisted or have commands run on them again")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to un-exile").setRequired(true)
    ),

  async execute(interaction) {

    const targetUser = interaction.options.getUser("user");
    const cleared     = await clearExile(targetUser.id);

    if (!cleared) {
      return interaction.editReply({ content: `**${targetUser.username}** is not currently exiled.` });
    }

    // DM the target so they know their exile was lifted and by whom
    const { embed, files } = buildExileClearedEmbed({ officerId: interaction.user.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ **${targetUser.username}**'s exile has been cleared. They may now be enlisted or have commands run on them.`,
    });
  },
};
