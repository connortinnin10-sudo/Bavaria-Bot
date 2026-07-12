const { SlashCommandBuilder } = require("discord.js");
const { removeFromDepartment, findUser } = require("../sheets");
const { buildDepartmentRemovedEmbed } = require("../notifyEmbeds");

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
    const DEPT_ROLES = {
      "Recruitment Department": "1224512938983952475",
      "Propaganda Department":  "1224513613377568889",
      "Flag Department":        "1193815658182492191",
    };

    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const department = interaction.options.getString("department");

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const name         = (record.rowData[2] ?? "").toString().trim();
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const removed      = await removeFromDepartment({ name, department });

    if (!removed) {
      return interaction.editReply({
        content: `**${name}** was not found in **${department}**.`,
      });
    }

    const roleId = DEPT_ROLES[department];
    if (roleId && targetMember) {
      await targetMember.roles.remove(roleId).catch(err =>
        console.error(`Failed to remove department role:`, err.message)
      );
    }

    const { embed, files } = buildDepartmentRemovedEmbed({ department, officerId: interaction.user.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ **${name}** has been removed from **${department}**.`,
    });
  },
};
