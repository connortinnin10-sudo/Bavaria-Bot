const { SlashCommandBuilder } = require("discord.js");
const { addToFlagDepartment, findUser } = require("../sheets");
const { buildFlagDepartmentAddedEmbed } = require("../notifyEmbeds");

const DEPARTMENT = "Flag Department";
const DEPT_ROLE  = "1193815658182492191";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add_flag-department")
    .setDescription("Add a member to the Flag Department for their company")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to add").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("position")
        .setDescription("Flag position to assign")
        .setRequired(true)
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
        .setDescription("Company they are flagging for")
        .setRequired(true)
        .addChoices(
          { name: "Bayreuth",  value: "Bayreuth"  },
          { name: "Rosenheim", value: "Rosenheim" },
          { name: "Grenadier", value: "Grenadier" }
        )
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });

    const position = interaction.options.getString("position");
    const company  = interaction.options.getString("company");

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** is not found in the regiment records. They must be enlisted first.`,
      });
    }

    // A member may only flag for the company they actually belong to.
    if (record.company !== company) {
      return interaction.editReply({
        content: "User must be apart of the company they're flagging for. use the /transfer_company command to assign them.",
      });
    }

    const username     = (record.rowData[2] ?? "").toString().trim();
    const rank         = (record.rowData[0] ?? "").toString().trim();
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    try {
      await addToFlagDepartment({ company, position, rank, username });
    } catch (err) {
      if (err.message === "SECTION_FULL") {
        return interaction.editReply({ content: `❌ The **${company}** flag section is full. No available slots.` });
      }
      if (err.message === "ALREADY_IN_DEPARTMENT") {
        return interaction.editReply({ content: `❌ **${username}** is already in **${DEPARTMENT}**.` });
      }
      throw err;
    }

    if (targetMember) {
      await targetMember.roles.add(DEPT_ROLE).catch(err =>
        console.error(`Failed to add department role:`, err.message)
      );
    }

    const { embed, files } = buildFlagDepartmentAddedEmbed({ position, company, officerId: interaction.user.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ **${username}** has been added to **${DEPARTMENT}**.\n> **Position:** ${position}\n> **Company:** ${company}\n> **Rank:** ${rank}`,
    });
  },
};
