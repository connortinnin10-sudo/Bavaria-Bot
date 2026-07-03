const { SlashCommandBuilder } = require("discord.js");
const { findUser, getActiveAccountability, applyAccountability } = require("../sheets");

const DATE_REGEX = /^\d{1,2}\/\d{1,2}\/\d{2}$/;

function parseDate(str) {
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const d = new Date(2000 + parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  return isNaN(d.getTime()) ? null : d;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_accountability")
    .setDescription("Place a member on accountability")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to place on accountability").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("leave_date").setDescription("Leave date — D/M/YY (e.g. 6/7/26)").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("return_date").setDescription("Return date — D/M/YY (e.g. 20/7/26)").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for accountability").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const leaveDate  = interaction.options.getString("leave_date").trim();
    const returnDate = interaction.options.getString("return_date").trim();
    const reason     = interaction.options.getString("reason").trim();

    if (!DATE_REGEX.test(leaveDate) || !DATE_REGEX.test(returnDate)) {
      return interaction.editReply({
        content: "❌ Invalid date format. Please use D/M/YY (e.g. `6/7/26`).",
      });
    }

    const leaveParsed  = parseDate(leaveDate);
    const returnParsed = parseDate(returnDate);

    if (!leaveParsed || !returnParsed) {
      return interaction.editReply({ content: "❌ One or both dates are invalid." });
    }

    if (returnParsed <= leaveParsed) {
      return interaction.editReply({
        content: "❌ Return date must be at least one day after the leave date.",
      });
    }

    const existing = await getActiveAccountability(targetUser.id);
    if (existing) {
      return interaction.editReply({
        content: `❌ **${targetUser.username}** already has an active accountability until **${existing[4]}**. Cannot create another until they return.`,
      });
    }

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    await applyAccountability({ userId: targetUser.id, leaveDate, returnDate, reason });

    return interaction.editReply({
      content: `✅ **${targetUser.username}** has been placed on accountability.\n> **Leave:** ${leaveDate}\n> **Return:** ${returnDate}\n> **Reason:** ${reason}`,
    });
  },
};
