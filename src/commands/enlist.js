const { SlashCommandBuilder } = require("discord.js");
const { enlistToDonauworth, findUser, parseUsername, findReserveUser, removeReserveUser } = require("../sheets");
const { buildDonauworthWelcomeEmbed } = require("../welcomeEmbed");
const { sendEnlistmentLog } = require("../welcomeLog");
const { ROLE_DONAUWORTH } = require("../permissions");

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
    .setName("user_enlist")
    .setDescription("Enlist a recruit — fresh recruits and mercenaries go to Donauwörth as Conscript")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The recruit to enlist").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("timezone").setDescription("Recruit's timezone (e.g. EST, GMT+1)").setRequired(true)
    ),

  async execute(interaction) {

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id);
    const displayName  = parseUsername(targetMember?.nickname ?? targetUser.username);
    const timezone     = interaction.options.getString("timezone");

    // Check if already enlisted (also catches Donauwörth occupants)
    const existing = await findUser(targetUser.id);
    if (existing !== null) {
      return interaction.editReply({
        content: `${displayName} is already enlisted in the regiment.`,
      });
    }

    // Veterans on the reserve are NOT enlisted here — they return via
    // /transfer_company at their retained rank. Enlisting them would demote them to
    // Conscript, so block and redirect. Mercenary-reserve members and fresh recruits
    // continue to the Donauwörth path below as Conscript trial members.
    const reserveRecord = await findReserveUser(targetUser.id);
    if (reserveRecord?.type === "veteran") {
      return interaction.editReply({
        content: `**${displayName}** is a veteran on reserve — use \`/transfer_company\` to bring them back at their rank.`,
      });
    }

    // Donauwörth induction path — fresh recruits and mercenary re-enlists.
    const rank = "Conscript";
    try {
      await enlistToDonauworth({ userId: targetUser.id, username: displayName, timezone });
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({
          content: "❌ No available rows in **Donauwörth**. Contact an administrator.",
        });
      }
      throw err;
    }
    // Clear the mercenary reserve record if they were re-enlisting from it.
    if (reserveRecord) await removeReserveUser(targetUser.id);

    // Reset any leftover rank roles (Soldat, Caporal, etc.) so a re-enlisting
    // mercenary or a returning former member starts clean at Conscript. Keep
    // Conscript itself out of the strip list since we re-add it below.
    const rankRolesToStrip = Object.entries(RANK_ROLES)
      .filter(([name]) => name !== "Conscript")
      .map(([, id]) => id)
      .filter(Boolean);
    for (const roleId of rankRolesToStrip) {
      await targetMember.roles.remove(roleId).catch((err) =>
        console.error(`Failed to remove rank role ${roleId}:`, err.message)
      );
    }

    // No company role yet — assigned later when they graduate via /transfer_company.
    // The Donauwörth induction role marks them as a trial member until then.
    const rolesToAdd = [
      process.env.ROLE_REGIMENT,
      process.env.ROLE_PREMIER_CORPS,
      process.env.ROLE_GRANDE_ARMEE,
      ROLE_DONAUWORTH,
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

    const { embed, files } = buildDonauworthWelcomeEmbed({ userId: targetUser.id, rank });
    let dmFailed = false;
    await targetUser.send({ embeds: [embed], files }).catch(() => { dmFailed = true; });
    const dmNote = dmFailed
      ? `\n> ⚠️ Could not send the welcome DM — **${displayName}**'s DMs appear to be closed.`
      : "";

    // Log the enlistment (joining the regiment, distinct from a company transfer).
    await sendEnlistmentLog({ userId: targetUser.id });

    return interaction.editReply({
      content: `✅ **${displayName}** has been enlisted to **Donauwörth** for induction.\n> **Timezone:** ${timezone}\n> **Rank:** ${rank}${reserveRecord ? " (re-enlisted from mercenary reserve)" : ""}\n> **Nickname updated to:** ${newNickname}${dmNote}`,
    });
  },
};
