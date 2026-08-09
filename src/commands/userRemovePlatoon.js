const { SlashCommandBuilder } = require("discord.js");
const { removeFromPlatoon, parseUsername } = require("../sheets");

const PLATOON_CHOICES = [
  { name: "Löwenzug", value: "Löwenzug" },
  { name: "Alpenzug", value: "Alpenzug" },
  { name: "Donau",    value: "Donau" },
  { name: "Isar",     value: "Isar" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_remove_platoon")
    .setDescription("Remove a member from their platoon")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to remove").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("platoon").setDescription("Platoon (optional — auto-detected if omitted)").setRequired(false).addChoices(...PLATOON_CHOICES)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    const username = parseUsername(targetMember?.nickname ?? targetUser.username);
    const platoon  = interaction.options.getString("platoon"); // may be null → search all

    const removed = await removeFromPlatoon({ platoon, username });
    if (!removed) {
      return interaction.editReply({
        content: platoon
          ? `❌ **${username}** was not found in the **${platoon}** platoon.`
          : `❌ **${username}** is not in any platoon.`,
      });
    }

    return interaction.editReply({ content: `✅ **${username}** has been removed from the **${removed.platoon}** platoon.` });
  },
};
