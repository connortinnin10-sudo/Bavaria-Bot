const { SlashCommandBuilder } = require("discord.js");
const { findUser, removeSpecialization, parseUsername } = require("../sheets");
const { SPECIALIZATION_ROLES } = require("../permissions");
const { buildSpecializationRemoveEmbed } = require("../welcomeEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_remove_specialization")
    .setDescription("Remove a member's specialist position(s) from a company sheet")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to remove").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("company")
        .setDescription("The company to remove them from")
        .setRequired(true)
        .addChoices(
          { name: "Bayreuth",  value: "Bayreuth"  },
          { name: "Rosenheim", value: "Rosenheim" }
        )
    ),

  async execute(interaction) {

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    const company = interaction.options.getString("company");

    // Resolve the name to match against the specialization slots. Prefer the
    // roster name (how it was written on assign); fall back to their nickname so
    // stale slots can still be cleaned up if they've left the roster.
    const record   = await findUser(targetUser.id);
    const username  = (record?.rowData[2] ?? "").toString().trim() || parseUsername(targetMember.nickname ?? targetUser.username);

    const removed = await removeSpecialization({ company, username });
    if (removed.length === 0) {
      return interaction.editReply({
        content: `**${username}** holds no specialist position in **${company}**.`,
      });
    }

    // Strip the Discord role(s) for each position that was removed.
    for (const pos of removed) {
      for (const roleId of SPECIALIZATION_ROLES[pos] ?? []) {
        await targetMember.roles.remove(roleId).catch((err) =>
          console.error(`Failed to remove specialization role ${roleId}:`, err.message)
        );
      }
    }

    // DM the member (never blocks on closed DMs).
    const { embed, files } = buildSpecializationRemoveEmbed({ userId: targetUser.id, positions: removed, company });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ **${username}** has been removed as **${removed.join(", ")}** of **${company}**.`,
    });
  },
};
