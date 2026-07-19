const { SlashCommandBuilder } = require("discord.js");
const { findUser, findSpecializations, assignSpecialization, parseUsername } = require("../sheets");
const { rankAtLeast, SPECIALIZATION_ROLES } = require("../permissions");
const { buildSpecializationAssignEmbed } = require("../welcomeEmbed");

// Minimum rank required for each specialist position.
const MIN_RANK = {
  Sapper:     "Caporal",
  Drummer:    "Caporal",
  "Schützen": "Caporal de Premier",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_assign_specialization")
    .setDescription("Assign a member a specialist position (Sapper, Drummer, or Schützen)")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to assign").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("company")
        .setDescription("The member's company")
        .setRequired(true)
        .addChoices(
          { name: "Bayreuth",  value: "Bayreuth"  },
          { name: "Rosenheim", value: "Rosenheim" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("position")
        .setDescription("The specialist position to assign")
        .setRequired(true)
        .addChoices(
          { name: "Sapper",   value: "Sapper"   },
          { name: "Drummer",  value: "Drummer"  },
          { name: "Schützen", value: "Schützen" }
        )
    ),

  async execute(interaction) {

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    const company  = interaction.options.getString("company");
    const position = interaction.options.getString("position");

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    // The member must actually be enlisted in the selected company. This also
    // blocks Grenadier / Donauwörth members from being given a specialization.
    if (record.company !== company) {
      return interaction.editReply({
        content: `**${targetUser.username}** is enlisted in **${record.company}**, not **${company}**. Assign their specialization on their own company.`,
      });
    }

    const rank     = (record.rowData[0] ?? "").toString().trim();
    const username = (record.rowData[2] ?? "").toString().trim() || parseUsername(targetMember.nickname ?? targetUser.username);

    // One specialization at a time — reject if they already hold one on this sheet.
    const existing = await findSpecializations(company, username);
    if (existing.length > 0) {
      const held = [...new Set(existing.map((e) => e.position))].join(", ");
      return interaction.editReply({
        content: `**${username}** is already assigned as **${held}** of **${company}**. Remove that first with \`/user_remove_specialization\`.`,
      });
    }

    // Rank gate — each position has its own floor.
    const minRank = MIN_RANK[position];
    if (minRank && !rankAtLeast(rank, minRank)) {
      return interaction.editReply({
        content: `**${username}** is **${rank || "Unranked"}** — the **${position}** position requires **${minRank}** or higher.`,
      });
    }

    let result;
    try {
      result = await assignSpecialization({ company, position, rank, username });
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({
          content: `❌ All **${position}** slots for **${company}** are filled. Remove one first.`,
        });
      }
      throw err;
    }

    // Grant the position's Discord role(s).
    for (const roleId of SPECIALIZATION_ROLES[position] ?? []) {
      await targetMember.roles.add(roleId).catch((err) =>
        console.error(`Failed to add specialization role ${roleId}:`, err.message)
      );
    }

    // DM the member their congratulations (never blocks on closed DMs).
    const { embed, files } = buildSpecializationAssignEmbed({ userId: targetUser.id, position, company });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ **${username}** has been assigned as a **${position}** of **${company}** (row ${result.rowNumber}).`,
    });
  },
};
