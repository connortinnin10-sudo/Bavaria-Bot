const { SlashCommandBuilder } = require("discord.js");
const { enlistUser, findUser, parseUsername, findReserveUser, removeReserveUser } = require("../sheets");
const { COMPANY_ROLES } = require("../permissions");

const RANK_ROLES = {
  "Soldat":             process.env.RANK_ROLE_SOLDAT,
  "Soldat de Premier":  process.env.RANK_ROLE_SOLDAT_DE_PREMIER,
  "Caporal":            process.env.RANK_ROLE_CAPORAL,
  "Caporal de Premier": process.env.RANK_ROLE_CAPORAL_DE_PREMIER,
  "Caporal-Fourrier":   process.env.RANK_ROLE_CAPORAL_FOURRIER,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add_to_regiment")
    .setDescription("[TEMPORARY] Enlist a member directly into a company, bypassing Donauwörth")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to enlist").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("timezone").setDescription("Member's timezone (e.g. EST, GMT+1)").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("rank")
        .setDescription("Starting rank")
        .setRequired(true)
        .addChoices(
          { name: "Soldat",             value: "Soldat"             },
          { name: "Soldat de Premier",  value: "Soldat de Premier"  },
          { name: "Caporal",            value: "Caporal"            },
          { name: "Caporal de Premier", value: "Caporal de Premier" },
          { name: "Caporal-Fourrier",   value: "Caporal-Fourrier"   }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("company")
        .setDescription("Company assignment")
        .setRequired(true)
        .addChoices(
          { name: "Bayreuth",  value: "Bayreuth"  },
          { name: "Rosenheim", value: "Rosenheim" }
        )
    ),

  async execute(interaction) {

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id);
    const displayName  = parseUsername(targetMember?.nickname ?? targetUser.username);
    const timezone     = interaction.options.getString("timezone");
    const rank         = interaction.options.getString("rank");
    const company      = interaction.options.getString("company");

    // Check if already enlisted (also catches Donauwörth occupants)
    const existing = await findUser(targetUser.id);
    if (existing !== null) {
      return interaction.editReply({
        content: `${displayName} is already enlisted in the regiment.`,
      });
    }

    // If on reserve, clear the stale record — the officer's typed rank wins here,
    // no restoration of the reserve-stored rank.
    const onReserve = await findReserveUser(targetUser.id);
    if (onReserve) await removeReserveUser(targetUser.id);

    try {
      await enlistUser({
        userId:   targetUser.id,
        username: displayName,
        company,
        timezone,
        rank,
      });
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({
          content: `❌ No available rows in **${company}** company. Contact an administrator.`,
        });
      }
      throw err;
    }

    const rolesToAdd = [
      process.env.ROLE_REGIMENT,
      process.env.ROLE_PREMIER_CORPS,
      process.env.ROLE_GRANDE_ARMEE,
      COMPANY_ROLES[company],
      RANK_ROLES[rank],
    ].filter(Boolean);

    for (const roleId of rolesToAdd) {
      await targetMember.roles.add(roleId).catch((err) =>
        console.error(`Failed to add role ${roleId}:`, err.message)
      );
    }

    await targetMember.roles.remove(process.env.GUEST_ROLE).catch((err) =>
      console.error("Failed to remove guest role:", err.message)
    );

    const newNickname = `[2.] ${displayName}`;
    await targetMember.setNickname(newNickname).catch((err) =>
      console.error("Failed to set nickname:", err.message)
    );

    return interaction.editReply({
      content: `✅ **${displayName}** has been enlisted directly into **${company}**.\n> **Timezone:** ${timezone}\n> **Rank:** ${rank}\n> **Nickname updated to:** ${newNickname}`,
    });
  },
};
