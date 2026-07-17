const { SlashCommandBuilder } = require("discord.js");
const { enlistUser, enlistToDonauworth, pickBalancedCompany, findUser, parseUsername, findReserveUser, removeReserveUser, getCompanyStaff } = require("../sheets");
const { buildDonauworthWelcomeEmbed, buildVeteranWelcomeBackEmbed } = require("../welcomeEmbed");
const { COMPANY_ROLES, PROTECTED_RANKS } = require("../permissions");

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

    // Only genuine veterans (Soldat+ on the veteran reserve) skip induction and
    // return straight to a company at their restored rank. Everyone else —
    // fresh recruits and mercenary-reserve members — goes through Donauwörth
    // as a Conscript trial member.
    const reserveRecord = await findReserveUser(targetUser.id);
    const isVeteran = reserveRecord?.type === "veteran";

    if (isVeteran) {
      let rank = (reserveRecord.rowData[2] ?? "").toString().trim() || "Soldat";
      if (PROTECTED_RANKS.has(rank)) rank = "Caporal-Fourrier";

      // Auto-assign to whichever Fusilier company is thinner on members.
      const company = await pickBalancedCompany();

      try {
        await enlistUser({ userId: targetUser.id, username: displayName, company, timezone, rank });
      } catch (err) {
        if (err.message === "NO_SPACE") {
          return interaction.editReply({
            content: `❌ No available rows in **${company}** company. Contact an administrator.`,
          });
        }
        throw err;
      }
      await removeReserveUser(targetUser.id);

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

      const staff = await getCompanyStaff(company);
      const { embed, files } = buildVeteranWelcomeBackEmbed({ userId: targetUser.id, rank, company, staff });
      let dmFailed = false;
      await targetUser.send({ embeds: [embed], files }).catch(() => { dmFailed = true; });
      const dmNote = dmFailed
        ? `\n> ⚠️ Could not send the welcome DM — **${displayName}**'s DMs appear to be closed.`
        : "";

      return interaction.editReply({
        content: `✅ **${displayName}** has been re-enlisted from the veteran reserve.\n> **Company:** ${company} (auto-assigned by headcount)\n> **Timezone:** ${timezone}\n> **Rank:** ${rank} (restored)\n> **Nickname updated to:** ${newNickname}${dmNote}`,
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

    // No company role yet — assigned later when they graduate via /transfer_company.
    const rolesToAdd = [
      process.env.ROLE_REGIMENT,
      process.env.ROLE_PREMIER_CORPS,
      process.env.ROLE_GRANDE_ARMEE,
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

    return interaction.editReply({
      content: `✅ **${displayName}** has been enlisted to **Donauwörth** for induction.\n> **Timezone:** ${timezone}\n> **Rank:** ${rank}${reserveRecord ? " (re-enlisted from mercenary reserve)" : ""}\n> **Nickname updated to:** ${newNickname}${dmNote}`,
    });
  },
};
