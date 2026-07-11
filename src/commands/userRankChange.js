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

const RANK_ROLE_IDS = new Set([
  process.env.RANK_ROLE_CONSCRIPT,
  process.env.RANK_ROLE_SOLDAT,
  process.env.RANK_ROLE_SOLDAT_DE_PREMIER,
  process.env.RANK_ROLE_CAPORAL,
  process.env.RANK_ROLE_CAPORAL_DE_PREMIER,
  process.env.RANK_ROLE_CAPORAL_FOURRIER,
].filter(Boolean));

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

    // Build new role list in one API call: strip all rank roles, add the new one
    const newRoleId      = RANK_ROLES[newRank];
    const currentRoleIds = targetMember._roles ?? [...targetMember.roles.cache.keys()];
    const newRoleSet     = [
      ...currentRoleIds.filter(id => !RANK_ROLE_IDS.has(id)),
      ...(newRoleId ? [newRoleId] : []),
    ];

    await targetMember.edit({ roles: newRoleSet }).catch(err =>
      console.error("Failed to update rank roles:", err.message)
    );

    return interaction.editReply({
      content: `✅ **${username}** has been changed from **${currentRank || "Unknown"}** to **${newRank}**.`,
    });
  },
};
