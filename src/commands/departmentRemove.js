const { SlashCommandBuilder } = require("discord.js");
const { removeFromDepartment, findUser } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("department_remove")
    .setDescription("Remove a member from a department")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to remove").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("department")
        .setDescription("Department to remove them from")
        .setRequired(true)
        .addChoices(
          { name: "Recruitment Department", value: "Recruitment Department" },
          { name: "Propaganda Department",  value: "Propaganda Department"  },
          { name: "Flag Department",        value: "Flag Department"        }
        )
    ),

  async execute(interaction) {

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const department = interaction.options.getString("department");

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const name    = (record.rowData[2] ?? "").toString().trim();
    const removed = await removeFromDepartment({ name, department });

    if (!removed) {
      return interaction.editReply({
        content: `**${name}** was not found in **${department}**.`,
      });
    }

    return interaction.editReply({
      content: `✅ **${name}** has been removed from **${department}**.`,
    });
  },
};
