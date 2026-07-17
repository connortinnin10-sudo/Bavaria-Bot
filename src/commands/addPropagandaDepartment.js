const { SlashCommandBuilder } = require("discord.js");
const { addToDepartment, findUser } = require("../sheets");
const { buildDepartmentAddedEmbed } = require("../notifyEmbeds");

const DEPARTMENT = "Propaganda Department";
const DEPT_ROLE  = "1224513613377568889";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add_propaganda-department")
    .setDescription("Add a member to the Propaganda Department")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to add").setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });

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
      await addToDepartment({ userId: targetUser.id, department: DEPARTMENT, rank, username });
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({ content: `❌ **${DEPARTMENT}** is full. No available slots.` });
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

    const { embed, files } = buildDepartmentAddedEmbed({ department: DEPARTMENT, officerId: interaction.user.id });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    return interaction.editReply({
      content: `✅ **${username}** has been added to **${DEPARTMENT}**.\n> **Rank:** ${rank}`,
    });
  },
};
