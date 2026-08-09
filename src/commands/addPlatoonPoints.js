const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { getPlatoonPointCandidates, addPoints, recordPlatoonAward, PLATOON_ORDER } = require("../sheets");
const { hasAnyRole, ROLE_ETAT_MAJOR, COMMAND_PERMISSIONS } = require("../permissions");
const { logCommand } = require("../commandLog");
const { buildPointsAwardedEmbed } = require("../notifyEmbeds");

const BAVARIAN_BLUE = 0x1E5AA8;
const CREST_PATH    = "./assets/regiment-crest.png";
const CREST_ATTACH  = "regiment-crest.png";

function isOfficer(member) {
  if (!member) return false;
  const allowed = COMMAND_PERMISSIONS["add_platoon_points"] ?? [];
  return hasAnyRole(member, ROLE_ETAT_MAJOR) || hasAnyRole(member, ...allowed);
}

function buildPanelEmbed({ dateMD, found, pointValue, eligible, unmatched }) {
  const embed = new EmbedBuilder()
    .setColor(BAVARIAN_BLUE)
    .setTitle(`🎖️ Platoon Attendance Points — ${dateMD}`)
    .setThumbnail(`attachment://${CREST_ATTACH}`)
    .setTimestamp();

  if (!found) {
    embed.setDescription(`No attendance column found for **${dateMD}** on the Input sheet. Nothing to award.`);
    return { embed, total: 0 };
  }

  const groups = Object.fromEntries(PLATOON_ORDER.map((p) => [p, []]));
  for (const e of eligible) (groups[e.platoon] ??= []).push(e);
  for (const p of PLATOON_ORDER) {
    const members = groups[p] ?? [];
    embed.addFields({
      name:  `${p} (${members.length})`,
      value: members.length ? members.map((e) => `<@${e.discordId}> — ${e.name}`).join("\n") : "_None_",
    });
  }

  const skipped = unmatched.length
    ? `\n\n⚠️ Attended + in a platoon but no points profile (skipped): ${unmatched.map((u) => u.name).join(", ")}`
    : "";
  embed.setDescription(
    (eligible.length
      ? `**${eligible.length}** platoon member${eligible.length === 1 ? "" : "s"} attended today. Press **Add Points** to award **+${pointValue}** to everyone listed.`
      : "No eligible platoon members to award today.") + skipped
  );
  return { embed, total: eligible.length };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add_platoon_points")
    .setDescription("Award attendance points to platoon members who attended today"),

  async execute(interaction) {
    const data = await getPlatoonPointCandidates();
    const { embed, total } = buildPanelEmbed(data);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("platoon_points_add").setLabel("Add Points").setStyle(ButtonStyle.Success).setDisabled(total === 0),
      new ButtonBuilder().setCustomId("platoon_points_close").setLabel("Close").setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
      embeds: [embed],
      files: [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })],
      components: [row],
    });
  },

  // Routed here from index.js for the platoon_points_add / platoon_points_close buttons.
  async handleButton(interaction) {
    if (!isOfficer(interaction.member)) {
      return interaction.reply({ content: "⛔ You do not have permission to award platoon points.", flags: 64 });
    }

    if (interaction.customId === "platoon_points_close") {
      return interaction.update({ components: [] }).catch(() => null);
    }
    if (interaction.customId !== "platoon_points_add") return;

    await interaction.deferUpdate();

    // Recompute at click time — never trust the (possibly stale) panel.
    const { dateMD, pointValue, eligible } = await getPlatoonPointCandidates();

    const awarded = [];
    const failed  = [];
    for (const e of eligible) {
      try {
        const res = await addPoints(e.discordId, pointValue); // null if no profile
        if (!res) { failed.push(e); continue; }
        await recordPlatoonAward({ dateMD, username: e.name, userId: e.discordId, points: pointValue, officerId: interaction.user.id });
        awarded.push({ ...e, total: res.points });
      } catch (err) {
        console.error("[add_platoon_points] award failed for", e.discordId, err.message);
        failed.push(e);
      }
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(BAVARIAN_BLUE)
      .setTitle(`🎖️ Platoon Points Awarded — ${dateMD}`)
      .setTimestamp()
      .setDescription(
        (awarded.length
          ? `✅ **+${pointValue}** to **${awarded.length}**:\n` + awarded.map((a) => `> <@${a.discordId}> — **${a.total}**`).join("\n")
          : "No one was awarded.") +
        (failed.length
          ? `\n\n⚠️ Skipped **${failed.length}** (no points profile / error): ${failed.map((f) => f.name).join(", ")}`
          : "")
      );

    await interaction.editReply({ embeds: [resultEmbed], components: [], attachments: [] }).catch(() => null);

    // DM each awarded member (closed DMs ignored).
    for (const a of awarded) {
      const { embed, files } = buildPointsAwardedEmbed({ amount: pointValue, total: a.total });
      await interaction.client.users.fetch(a.discordId)
        .then((user) => user.send({ embeds: [embed], files }))
        .catch(() => null);
    }

    await logCommand({
      commandName: "add_platoon_points",
      officerId: interaction.user.id,
      reason: `+${pointValue} platoon attendance (${dateMD}) to ${awarded.map((a) => `<@${a.discordId}>`).join(", ") || "(none)"}` +
              (failed.length ? ` | skipped: ${failed.map((f) => f.name).join(", ")}` : ""),
    });
  },
};
