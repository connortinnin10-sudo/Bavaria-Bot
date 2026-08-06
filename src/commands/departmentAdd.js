const { SlashCommandBuilder } = require("discord.js");
const { addToDepartment, addToFlagDepartment, findUser } = require("../sheets");
const { buildDepartmentAddedEmbed, buildFlagDepartmentAddedEmbed } = require("../notifyEmbeds");

const DEPT_ROLES = {
  "Recruitment Department": "1224512938983952475",
  "Propaganda Department":  "1224513613377568889",
  "Flag Department":        "1193815658182492191",
};

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
        .setDescription("Which department")
        .setRequired(true)
        .addChoices(
          { name: "Recruitment", value: "Recruitment Department" },
          { name: "Propaganda",  value: "Propaganda Department"  },
          { name: "Flag",        value: "Flag Department"        }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("position")
        .setDescription("Flag Department only: the flag position")
        .setRequired(false)
        .addChoices(
          { name: "Flag Trainee",       value: "Flag Trainee"       },
          { name: "Flag Guard Junior",  value: "Flag Guard Junior"  },
          { name: "Flag Guard Senior",  value: "Flag Guard Senior"  },
          { name: "Flag Bearer Junior", value: "Flag Bearer Junior" },
          { name: "Flag Bearer Senior", value: "Flag Bearer Senior" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("company")
        .setDescription("Flag Department only: the company they flag for")
        .setRequired(false)
        .addChoices(
          { name: "Bayreuth",  value: "Bayreuth"  },
          { name: "Rosenheim", value: "Rosenheim" },
          { name: "Grenadier", value: "Grenadier" }
        )
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });

    const department = interaction.options.getString("department");
    const position   = interaction.options.getString("position");
    const company    = interaction.options.getString("company");

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** is not found in the regiment records. They must be enlisted first.`,
      });
    }

    const username     = (record.rowData[2] ?? "").toString().trim();
    const rank         = (record.rowData[0] ?? "").toString().trim();
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const deptRole     = DEPT_ROLES[department];

    // Flag Department: needs a position + company, and the member must belong to
    // the company they're flagging for.
    if (department === "Flag Department") {
      if (!position || !company) {
        return interaction.editReply({ content: "❌ Flag Department requires both a **position** and a **company**." });
      }
      if (record.company !== company) {
        return interaction.editReply({
          content: "User must be apart of the company they're flagging for. use the /transfer_company command to assign them.",
        });
      }
      try {
        await addToFlagDepartment({ company, position, rank, username });
      } catch (err) {
        if (err.message === "SECTION_FULL")         return interaction.editReply({ content: `❌ The **${company}** flag section is full. No available slots.` });
        if (err.message === "ALREADY_IN_DEPARTMENT") return interaction.editReply({ content: `❌ **${username}** is already in **Flag Department**.` });
        throw err;
      }
      if (targetMember) await targetMember.roles.add(deptRole).catch((err) => console.error("Failed to add department role:", err.message));
      const { embed, files } = buildFlagDepartmentAddedEmbed({ position, company, officerId: interaction.user.id });
      await targetUser.send({ embeds: [embed], files }).catch(() => null);
      return interaction.editReply({
        content: `✅ **${username}** has been added to **Flag Department**.\n> **Position:** ${position}\n> **Company:** ${company}\n> **Rank:** ${rank}`,
      });
    }

    // Recruitment / Propaganda departments.
    try {
      await addToDepartment({ userId: targetUser.id, department, rank, username });
    } catch (err) {
      if (err.message === "NO_SPACE")             return interaction.editReply({ content: `❌ **${department}** is full. No available slots.` });
      if (err.message === "ALREADY_IN_DEPARTMENT") return interaction.editReply({ content: `❌ **${username}** is already in **${department}**.` });
      throw err;
    }
    if (targetMember) await targetMember.roles.add(deptRole).catch((err) => console.error("Failed to add department role:", err.message));
    const { embed, files } = buildDepartmentAddedEmbed({ department, officerId: interaction.user.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);
    return interaction.editReply({
      content: `✅ **${username}** has been added to **${department}**.\n> **Rank:** ${rank}`,
    });
  },
};
