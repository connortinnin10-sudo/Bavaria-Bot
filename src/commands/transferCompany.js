const { SlashCommandBuilder } = require("discord.js");
const { transferCompany, getCompanyStaff } = require("../sheets");
const { buildTransferEmbed } = require("../welcomeEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("transfer_company")
    .setDescription("Transfer an enlisted member to the other company (Bayreuth <-> Rosenheim)")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to transfer").setRequired(true)
    ),

  async execute(interaction) {

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    let result;
    try {
      result = await transferCompany(targetUser.id);
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({ content: "❌ No available rows in the destination company. Contact an administrator." });
      }
      throw err;
    }

    if (!result) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const { fromCompany, toCompany, username, rank } = result;

    const OLD_ROLE = fromCompany === "Bayreuth" ? process.env.ROLE_BAYREUTH : process.env.ROLE_ROSENHEIM;
    const NEW_ROLE = toCompany === "Bayreuth" ? process.env.ROLE_BAYREUTH : process.env.ROLE_ROSENHEIM;

    await targetMember.roles.remove(OLD_ROLE).catch((err) =>
      console.error("Failed to remove old company role:", err.message)
    );
    await targetMember.roles.add(NEW_ROLE).catch((err) =>
      console.error("Failed to add new company role:", err.message)
    );

    // DM the member their new company assignment and staff
    const staff = await getCompanyStaff(toCompany);
    const { embed, files } = buildTransferEmbed({ userId: targetUser.id, company: toCompany, staff });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ **${username || targetUser.username}** has been transferred from **${fromCompany}** to **${toCompany}**.\n> **Rank:** ${rank || "Unknown"}\n> Attendance history carried over. Kills, KPE, and activity% will recalculate automatically.`,
    });
  },
};
