const { SlashCommandBuilder } = require("discord.js");
const { findUser, addToPlatoon, parseUsername } = require("../sheets");
const { buildPlatoonAddedEmbed } = require("../notifyEmbeds");

const PLATOON_CHOICES = [
  { name: "Löwenzug", value: "Löwenzug" },
  { name: "Alpenzug", value: "Alpenzug" },
  { name: "Donau",    value: "Donau" },
  { name: "Isar",     value: "Isar" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_add_platoon")
    .setDescription("Add a member to a platoon")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to add").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("platoon").setDescription("Platoon to add them to").setRequired(true).addChoices(...PLATOON_CHOICES)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) return interaction.editReply({ content: "Could not find that member in this server." });

    const platoon  = interaction.options.getString("platoon");
    const username = parseUsername(targetMember.nickname ?? targetUser.username);

    // Rank shown on the platoon sheet = their current regiment rank (fallback Soldat).
    const enlist = await findUser(targetUser.id).catch(() => null);
    const rank   = enlist ? ((enlist.rowData[0] ?? "").toString().trim() || "Soldat") : "Soldat";

    try {
      await addToPlatoon({ platoon, rank, username });
    } catch (err) {
      if (err.message === "ALREADY_IN_PLATOON") {
        return interaction.editReply({ content: `❌ **${username}** is already in the **${err.platoon}** platoon. Remove them first with \`/user_remove_platoon\`.` });
      }
      if (err.message === "NO_SPACE") {
        return interaction.editReply({ content: `❌ The **${platoon}** platoon is full (8/8). No open slots.` });
      }
      throw err;
    }

    const { embed, files } = buildPlatoonAddedEmbed({ platoon, officerId: interaction.user.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({ content: `✅ **${username}** has been added to the **${platoon}** platoon.` });
  },
};
