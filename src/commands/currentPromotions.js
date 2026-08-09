const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { getReadyMembers, promoteUser, resetPoints } = require("../sheets");
const { POINTS_SYSTEM_ENABLED, hasAnyRole, ROLE_ETAT_MAJOR, COMMAND_PERMISSIONS, pointsForNextRank } = require("../permissions");
const { logCommand } = require("../commandLog");
const { buildPromotionEmbed } = require("../notifyEmbeds");

const BAVARIAN_BLUE = 0x1E5AA8;
const CREST_PATH    = "./assets/regiment-crest.png";
const CREST_ATTACH  = "regiment-crest.png";
const COMPANY_ORDER = ["Schützen", "Bayreuth", "Grenadier"];

// Rank-role maps (env-based, same shape as userRankChange.js). The role swap on
// approval strips whatever enlisted rank role a member holds and adds the new one.
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

function isOfficer(member) {
  if (!member) return false;
  const allowed = COMMAND_PERMISSIONS["current_promotions"] ?? [];
  return hasAnyRole(member, ROLE_ETAT_MAJOR) || hasAnyRole(member, ...allowed);
}

function buildPanelEmbed(groups) {
  let total = 0;
  const embed = new EmbedBuilder()
    .setColor(BAVARIAN_BLUE)
    .setTitle("🎖️ Promotions Ready for Approval")
    .setThumbnail(`attachment://${CREST_ATTACH}`)
    .setTimestamp();

  for (const company of COMPANY_ORDER) {
    const members = groups[company] ?? [];
    total += members.length;
    embed.addFields({
      name: `${company} (${members.length})`,
      value: members.length
        ? members.map((m) => `<@${m.userId}> — **${m.currentRank}** → ${m.nextRank}`).join("\n")
        : "_None_",
    });
  }
  embed.setDescription(total
    ? `**${total}** member${total === 1 ? "" : "s"} ready for promotion. Press **Approve All** to promote everyone listed.`
    : "No members are currently ready for promotion.");
  return { embed, total };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("current_promotions")
    .setDescription("List members ready for promotion and approve them in bulk"),

  async execute(interaction) {
    if (!POINTS_SYSTEM_ENABLED) {
      return interaction.editReply({ content: "⚠️ The promotion points system is temporarily disabled." });
    }

    const groups = await getReadyMembers();
    const { embed, total } = buildPanelEmbed(groups);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("promo_approve").setLabel("Approve All").setStyle(ButtonStyle.Success).setDisabled(total === 0),
      new ButtonBuilder().setCustomId("promo_close").setLabel("Close").setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
      embeds: [embed],
      files: [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })],
      components: [row],
    });
  },

  // Routed here from index.js for the promo_approve / promo_close buttons.
  async handleButton(interaction) {
    if (!isOfficer(interaction.member)) {
      return interaction.reply({ content: "⛔ You do not have permission to approve promotions.", flags: 64 });
    }

    if (interaction.customId === "promo_close") {
      return interaction.update({ components: [] }).catch(() => null);
    }
    if (interaction.customId !== "promo_approve") return;

    if (!POINTS_SYSTEM_ENABLED) {
      return interaction.reply({ content: "⚠️ The promotion points system is temporarily disabled.", flags: 64 });
    }

    await interaction.deferUpdate();

    // Recompute the Ready list at click time — never trust the (possibly stale) embed.
    const groups = await getReadyMembers();
    const all = COMPANY_ORDER.flatMap((c) => groups[c] ?? []);

    const promoted = [];
    const failed   = [];
    for (const m of all) {
      const member = await interaction.guild.members.fetch(m.userId).catch(() => null);
      if (!member) { failed.push(m); continue; } // left the server — don't touch the sheet
      try {
        await promoteUser(m.userId, m.nextRank);         // sheet rank up one
        await resetPoints(m.userId);                     // points -> 0, Ready cleared
        const newRoleId = RANK_ROLES[m.nextRank];
        const currentRoleIds = member._roles ?? [...member.roles.cache.keys()];
        const newRoleSet = [...currentRoleIds.filter((id) => !RANK_ROLE_IDS.has(id)), ...(newRoleId ? [newRoleId] : [])];
        await member.edit({ roles: newRoleSet });
        promoted.push(m);
      } catch (err) {
        console.error("[current_promotions] failed to promote", m.userId, err.message);
        failed.push(m);
      }
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(BAVARIAN_BLUE)
      .setTitle("🎖️ Promotions Approved")
      .setTimestamp()
      .setDescription(
        (promoted.length
          ? `✅ Promoted **${promoted.length}**:\n` + promoted.map((m) => `> <@${m.userId}> — ${m.currentRank} → **${m.nextRank}**`).join("\n")
          : "No one was promoted.") +
        (failed.length
          ? `\n\n⚠️ Skipped **${failed.length}** (left server / error):\n` + failed.map((m) => `> <@${m.userId}>`).join("\n")
          : "")
      );

    await interaction.editReply({ embeds: [resultEmbed], components: [], attachments: [] }).catch(() => null);

    // DM each promoted member (closed DMs ignored).
    for (const m of promoted) {
      const { embed, files } = buildPromotionEmbed({
        username: m.username,
        rank: m.nextRank,
        nextThreshold: pointsForNextRank(m.nextRank),
      });
      await interaction.client.users.fetch(m.userId)
        .then((user) => user.send({ embeds: [embed], files }))
        .catch(() => null);
    }

    await logCommand({
      commandName: "current_promotions",
      officerId: interaction.user.id,
      reason: `Approved ${promoted.length} promotion(s): ${promoted.map((m) => `<@${m.userId}> → ${m.nextRank}`).join(", ") || "(none)"}` +
              (failed.length ? ` | skipped: ${failed.map((m) => `<@${m.userId}>`).join(", ")}` : ""),
    });
  },
};
