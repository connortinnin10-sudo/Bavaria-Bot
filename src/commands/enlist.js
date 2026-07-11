const { SlashCommandBuilder } = require("discord.js");
const { enlistUser, findUser, parseUsername, findReserveUser, removeReserveUser, getCompanyStaff } = require("../sheets");
const { buildWelcomeEmbed } = require("../welcomeEmbed");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_enlist")
    .setDescription("Enlist a new recruit into the regiment")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The recruit to enlist").setRequired(true)
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
    )
    .addStringOption((opt) =>
      opt.setName("timezone").setDescription("Recruit's timezone (e.g. EST, GMT+1)").setRequired(true)
    ),

  async execute(interaction) {

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id);
    const displayName  = parseUsername(targetMember?.nickname ?? targetUser.username);
    const company      = interaction.options.getString("company");
    const timezone     = interaction.options.getString("timezone");

    // Check if already enlisted
    const existing = await findUser(targetUser.id);
    if (existing !== null) {
      return interaction.editReply({
        content: `${displayName} is already enlisted in the regiment.`,
      });
    }

    // Determine rank from reserve status: veteran restores their carried rank,
    // mercenary re-enlists as Soldat, and a true fresh recruit starts as Conscript.
    const reserveRecord = await findReserveUser(targetUser.id);
    let rank = "Conscript";
    if (reserveRecord) {
      if (reserveRecord.type === "veteran") {
        rank = (reserveRecord.rowData[2] ?? "").toString().trim() || "Soldat";
      } else {
        rank = "Soldat";
      }
      await removeReserveUser(targetUser.id);
    }

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

    // Assign roles
    const RANK_ROLES = {
      "Conscript":          process.env.RANK_ROLE_CONSCRIPT,
      "Soldat":             process.env.RANK_ROLE_SOLDAT,
      "Soldat de Premier":  process.env.RANK_ROLE_SOLDAT_DE_PREMIER,
      "Caporal":            process.env.RANK_ROLE_CAPORAL,
      "Caporal de Premier": process.env.RANK_ROLE_CAPORAL_DE_PREMIER,
      "Caporal-Fourrier":   process.env.RANK_ROLE_CAPORAL_FOURRIER,
    };

    const rolesToAdd = [
      process.env.ROLE_REGIMENT,
      process.env.ROLE_PREMIER_CORPS,
      process.env.ROLE_GRANDE_ARMEE,
      company === "Bayreuth" ? process.env.ROLE_BAYREUTH : process.env.ROLE_ROSENHEIM,
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

    // Update nickname to [2.] (username)
    const newNickname = `[2.] ${displayName}`;
    await targetMember.setNickname(newNickname).catch((err) =>
      console.error("Failed to set nickname:", err.message)
    );

    // DM the recruit a welcome embed with company staff tags and channel links
    const staff = await getCompanyStaff(company);
    const { embed, files } = buildWelcomeEmbed({ userId: targetUser.id, company, staff });
    let dmFailed = false;
    await targetUser.send({ embeds: [embed], files }).catch(() => { dmFailed = true; });

    const dmNote = dmFailed
      ? `\n> ⚠️ Could not send the welcome DM — **${displayName}**'s DMs appear to be closed.`
      : "";

    return interaction.editReply({
      content: `✅ **${displayName}** has been enlisted.\n> **Company:** ${company}\n> **Timezone:** ${timezone}\n> **Rank:** ${rank}${reserveRecord ? ` (restored from ${reserveRecord.type} reserve)` : ""}\n> **Nickname updated to:** ${newNickname}${dmNote}`,
    });
  },
};
