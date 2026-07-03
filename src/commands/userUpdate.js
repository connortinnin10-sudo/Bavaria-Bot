const { SlashCommandBuilder } = require("discord.js");
const { findUser, updateUserField } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_update")
    .setDescription("Update a member's record")
    .addSubcommand((sub) =>
      sub
        .setName("change_timezone")
        .setDescription("Update a member's timezone")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The member to update").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("new_timezone").setDescription("New timezone (e.g. EST, GMT+1)").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("change_username")
        .setDescription("Update a member's username")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The member to update").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("new_username").setDescription("New username").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("change_discord_account")
        .setDescription("Relink a member's record to a new Discord account")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("The member to update").setRequired(true)
        )
        .addUserOption((opt) =>
          opt.setName("new_account").setDescription("Tag new account").setRequired(true)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const sub        = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser("user");

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const oldUsername = (record.rowData[2] ?? "").toString().trim();

    if (sub === "change_timezone") {
      const newTimezone = interaction.options.getString("new_timezone");
      await updateUserField({ record, field: "timezone", newValue: newTimezone });
      return interaction.editReply({
        content: `✅ Timezone updated to **${newTimezone}** for **${oldUsername}**.`,
      });
    }

    if (sub === "change_username") {
      const newUsername = interaction.options.getString("new_username");
      await updateUserField({ record, field: "username", newValue: newUsername, oldUsername });
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (targetMember) {
        await targetMember.setNickname(`[2.] ${newUsername}`).catch((err) =>
          console.error("Failed to update nickname:", err.message)
        );
      }
      return interaction.editReply({
        content: `✅ Username updated from **${oldUsername}** to **${newUsername}**.\n> Sheet, departments, and Discord nickname updated.`,
      });
    }

    if (sub === "change_discord_account") {
      const newAccount = interaction.options.getUser("new_account");
      await updateUserField({ record, field: "discordId", newValue: newAccount.id });
      return interaction.editReply({
        content: `✅ Discord account relinked.\n> **${targetUser.username}** → **${newAccount.username}**`,
      });
    }
  },
};
