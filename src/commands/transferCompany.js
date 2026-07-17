const { SlashCommandBuilder } = require("discord.js");
const { transferCompany, getCompanyStaff } = require("../sheets");
const { buildTransferEmbed } = require("../welcomeEmbed");
const { COMPANY_ROLES } = require("../permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("transfer_company")
    .setDescription("Transfer a member to a company (also graduates Donauworth trial members to Soldat)")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to transfer").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("company")
        .setDescription("Destination company")
        .setRequired(true)
        .addChoices(
          { name: "Bayreuth",  value: "Bayreuth"  },
          { name: "Rosenheim", value: "Rosenheim" },
          { name: "Grenadier", value: "Grenadier" }
        )
    ),

  async execute(interaction) {

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    const destination = interaction.options.getString("company");

    let result;
    try {
      result = await transferCompany(targetUser.id, destination);
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({ content: `❌ No available rows in **${destination}**. Contact an administrator.` });
      }
      if (err.message === "SAME_COMPANY") {
        return interaction.editReply({ content: `**${targetUser.username}** is already in **${destination}**.` });
      }
      throw err;
    }

    if (!result) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const { fromCompany, toCompany, username, rank } = result;
    const fromDonauworth = fromCompany === "Donauworth";

    // Company role swap. Donauworth has no company role to strip, so skip the
    // removal in that case. COMPANY_ROLES has entries for all three companies.
    const OLD_ROLE = COMPANY_ROLES[fromCompany];
    const NEW_ROLE = COMPANY_ROLES[toCompany];

    if (OLD_ROLE) {
      await targetMember.roles.remove(OLD_ROLE).catch((err) =>
        console.error("Failed to remove old company role:", err.message)
      );
    }
    if (NEW_ROLE) {
      await targetMember.roles.add(NEW_ROLE).catch((err) =>
        console.error("Failed to add new company role:", err.message)
      );
    }

    // Donauworth graduates are promoted Conscript -> Soldat; swap the rank role too.
    if (fromDonauworth) {
      await targetMember.roles.remove(process.env.RANK_ROLE_CONSCRIPT).catch((err) =>
        console.error("Failed to remove Conscript role:", err.message)
      );
      await targetMember.roles.add(process.env.RANK_ROLE_SOLDAT).catch((err) =>
        console.error("Failed to add Soldat role:", err.message)
      );
    }

    // DM the member their new company assignment and staff
    const staff = await getCompanyStaff(toCompany);
    const { embed, files } = buildTransferEmbed({ userId: targetUser.id, company: toCompany, staff });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    const graduationNote = fromDonauworth
      ? "\n> Graduated from Donauworth induction — promoted to **Soldat**."
      : "\n> Attendance history carried over. Kills, KPE, and activity% will recalculate automatically.";

    return interaction.editReply({
      content: `✅ **${username || targetUser.username}** has been transferred from **${fromCompany}** to **${toCompany}**.\n> **Rank:** ${rank || "Unknown"}${graduationNote}`,
    });
  },
};
