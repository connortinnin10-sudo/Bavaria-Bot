const { SlashCommandBuilder } = require("discord.js");
const { promoteUser, findUser } = require("../sheets");
const { hasAnyRole } = require("../permissions");

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
  "Conscript":          process.env.RANK_ROLE_CONSCRIPT,
  "Soldat":             process.env.RANK_ROLE_SOLDAT,
  "Soldat de Premier":  process.env.RANK_ROLE_SOLDAT_DE_PREMIER,
  "Caporal":            process.env.RANK_ROLE_CAPORAL,
  "Caporal de Premier": process.env.RANK_ROLE_CAPORAL_DE_PREMIER,
  "Caporal-Fourrier":   process.env.RANK_ROLE_CAPORAL_FOURRIER,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_rank_change")
    .setDescription("Change a member's rank")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to update").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("new_rank")
        .setDescription("New rank to assign")
        .setRequired(true)
        .addChoices(
          { name: "Conscript",          value: "Conscript"          },
          { name: "Soldat",             value: "Soldat"             },
          { name: "Soldat de Premier",  value: "Soldat de Premier"  },
          { name: "Caporal",            value: "Caporal"            },
          { name: "Caporal de Premier", value: "Caporal de Premier" },
          { name: "Caporal-Fourrier",   value: "Caporal-Fourrier"   }
        )
    ),

  async execute(interaction) {
    console.log(`[perm:rank_change] member roles: ${[...interaction.member.roles.cache.keys()].join(",")}`);
    console.log(`[perm:rank_change] ROLE_PETIT_ETAT_MAJOR=${process.env.ROLE_PETIT_ETAT_MAJOR} ROLE_ETAT_MAJOR=${process.env.ROLE_ETAT_MAJOR}`);

    if (!hasAnyRole(interaction.member, process.env.ROLE_PETIT_ETAT_MAJOR, process.env.ROLE_ETAT_MAJOR)) {
      return interaction.editReply({ content: "❌ You do not have permission to use this command." });
    }

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const newRank      = interaction.options.getString("new_rank");
    const targetMember = await interaction.guild.members.fetch({ user: targetUser.id, force: true }).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const username    = (record.rowData[2] ?? targetUser.username).toString().trim();
    const currentRank = (record.rowData[0] ?? "").toString().trim();

    if (PROTECTED_RANKS.has(currentRank)) {
      return interaction.editReply({
        content: `**${username}** holds the rank of **${currentRank}** and cannot be changed through this command.`,
      });
    }

    if (currentRank === newRank) {
      return interaction.editReply({
        content: `**${username}** is already ranked **${newRank}**.`,
      });
    }

    await promoteUser(targetUser.id, newRank);

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
      content: `✅ **${username}** has been changed from **${currentRank || "Unknown"}** to **${newRank}**.`,
    });
  },
};
