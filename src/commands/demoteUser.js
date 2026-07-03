const { SlashCommandBuilder } = require("discord.js");
const { promoteUser, findUser } = require("../sheets");

const PROTECTED_RANKS = new Set([
  "Sergent",
  "Sergent Major",
  "Adjutant",
  "Adjutant Sous-Officier",
  "Sous-Lieutenant",
  "Lieutenant",
  "Capitaine",
  "Chef De Bataillon",
  "Major",
  "Colonel",
]);

const RANK_ROLES = {
  "Soldat":             process.env.RANK_ROLE_SOLDAT,
  "Soldat de Premier":  process.env.RANK_ROLE_SOLDAT_DE_PREMIER,
  "Caporal":            process.env.RANK_ROLE_CAPORAL,
  "Caporal de Premier": process.env.RANK_ROLE_CAPORAL_DE_PREMIER,
  "Caporal-Fourrier":   process.env.RANK_ROLE_CAPORAL_FOURRIER,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_demote")
    .setDescription("Demote a regiment member to a lower rank")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to demote").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("demoted_to")
        .setDescription("New rank")
        .setRequired(true)
        .addChoices(
          { name: "Soldat",             value: "Soldat"             },
          { name: "Soldat de Premier",  value: "Soldat de Premier"  },
          { name: "Caporal",            value: "Caporal"            },
          { name: "Caporal de Premier", value: "Caporal de Premier" },
          { name: "Caporal-Fourrier",   value: "Caporal-Fourrier"   }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    // Role check (temporarily disabled for testing)
    // if (!interaction.member.roles.cache.has(process.env.RECRUITMENT_ROLE_ID)) {
    //   return interaction.editReply("You do not have permission to use this command.");
    // }

    const targetUser   = interaction.options.getUser("user");
    const newRank      = interaction.options.getString("demoted_to");
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    // Check current rank on sheet
    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const currentRank = (record.rowData[0] ?? "").toString().trim();

    // Block protected ranks
    if (PROTECTED_RANKS.has(currentRank)) {
      return interaction.editReply({
        content: `**${targetUser.username}** holds the rank of **${currentRank}** and cannot be demoted through this command.`,
      });
    }

    // Block if already lowest rank
    if (currentRank === "Soldat") {
      return interaction.editReply({
        content: `**${targetUser.username}** is already at the lowest rank and cannot be demoted further.`,
      });
    }

    // Block if same rank
    if (currentRank === newRank) {
      return interaction.editReply({
        content: `**${targetUser.username}** is already ranked **${newRank}**.`,
      });
    }

    // Update rank on all sheets
    await promoteUser(targetUser.id, newRank);

    // Swap Discord rank roles
    for (const [, roleId] of Object.entries(RANK_ROLES)) {
      if (roleId && targetMember.roles.cache.has(roleId)) {
        await targetMember.roles.remove(roleId).catch((err) =>
          console.error(`Failed to remove rank role ${roleId}:`, err.message)
        );
      }
    }
    const newRoleId = RANK_ROLES[newRank];
    if (newRoleId) {
      await targetMember.roles.add(newRoleId).catch((err) =>
        console.error(`Failed to add rank role ${newRoleId}:`, err.message)
      );
    }

    return interaction.editReply({
      content: `✅ **${targetUser.username}** has been demoted from **${currentRank}** to **${newRank}**.`,
    });
  },
};
