const { SlashCommandBuilder } = require("discord.js");
const { addToDepartment, getUserRank, parseUsername } = require("../sheets");

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
    await interaction.deferReply({ flags: 64 });

    // Role check (temporarily disabled for testing)
    // if (!interaction.member.roles.cache.has(process.env.RECRUITMENT_ROLE_ID)) {
    //   return interaction.editReply("You do not have permission to use this command.");
    // }

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const department   = interaction.options.getString("department");

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    // Parse username using the same rule as enlist
    const username = parseUsername(targetMember.nickname ?? targetUser.username);

    // Look up their rank from the enlist sheet
    const rank = await getUserRank(targetUser.id);
    if (!rank) {
      return interaction.editReply({
        content: `**${username}** is not found in the regiment records. They must be enlisted first.`,
      });
    }

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
