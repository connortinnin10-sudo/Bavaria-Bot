const { SlashCommandBuilder } = require("discord.js");
const { addToDepartment, findUser } = require("../sheets");

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
        content: `**${targetUser.username}** is not found in the regiment records. They must be enlisted first.`,
      });
    }

    const username     = (record.rowData[2] ?? "").toString().trim();
    const rank         = (record.rowData[0] ?? "").toString().trim();
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

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

    const roleId = DEPT_ROLES[department];
    if (roleId && targetMember) {
      await targetMember.roles.add(roleId).catch(err =>
        console.error(`Failed to add department role:`, err.message)
      );
    }

    return interaction.editReply({
      content: `✅ **${username}** has been added to **${department}**.\n> **Rank:** ${rank}`,
    });
  },
};
