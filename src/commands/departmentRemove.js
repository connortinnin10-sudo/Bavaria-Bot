const { SlashCommandBuilder } = require("discord.js");
const { removeFromDepartment } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("department_remove")
    .setDescription("Remove a member from a department")
    .addStringOption((opt) =>
      opt.setName("name").setDescription("Their username on the sheet").setRequired(true)
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
    await interaction.deferReply({ flags: 64 });

    // Role check (temporarily disabled for testing)
    // if (!interaction.member.roles.cache.has(process.env.RECRUITMENT_ROLE_ID)) {
    //   return interaction.editReply("You do not have permission to use this command.");
    // }

    const name       = interaction.options.getString("name").trim();
    const department = interaction.options.getString("department");

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
