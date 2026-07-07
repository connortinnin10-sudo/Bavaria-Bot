const { SlashCommandBuilder } = require("discord.js");
const { addToDepartment, findUser } = require("../sheets");
const { hasAnyRole } = require("../permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("department_add")
    .setDescription("Add a member to a department")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to add").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("department")
        .setDescription("Department to assign")
        .setRequired(true)
        .addChoices(
          { name: "Recruitment Department", value: "Recruitment Department" },
          { name: "Propaganda Department",  value: "Propaganda Department"  },
          { name: "Flag Department",        value: "Flag Department"        }
        )
    ),

  async execute(interaction) {

    if (!hasAnyRole(interaction.member, process.env.ROLE_DEPARTMENT_HEAD, process.env.ROLE_ETAT_MAJOR)) {
      return interaction.editReply({ content: "❌ You do not have permission to use this command." });
    }

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const department = interaction.options.getString("department");

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** is not found in the regiment records. They must be enlisted first.`,
      });
    }

    const username = (record.rowData[2] ?? "").toString().trim();
    const rank     = (record.rowData[0] ?? "").toString().trim();

    try {
      await addToDepartment({ userId: targetUser.id, department, rank, username });
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({
          content: `❌ **${department}** is full. No available slots.`,
        });
      }
      if (err.message === "ALREADY_IN_DEPARTMENT") {
        return interaction.editReply({
          content: `❌ **${username}** is already in **${department}**.`,
        });
      }
      throw err;
    }

    return interaction.editReply({
      content: `✅ **${username}** has been added to **${department}**.\n> **Rank:** ${rank}`,
    });
  },
};
