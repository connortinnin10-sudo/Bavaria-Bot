const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { getEventPointCandidates, awardEventPoints, recordEventAwards, COMPANY_ORDER, PLATOON_ORDER } = require("../sheets");
const { hasAnyRole, ROLE_ETAT_MAJOR } = require("../permissions");
const { logCommand } = require("../commandLog");
const { buildPointsAwardedEmbed } = require("../notifyEmbeds");

const BAVARIAN_BLUE = 0x1E5AA8;
const CREST_PATH    = "./assets/regiment-crest.png";
const CREST_ATTACH  = "regiment-crest.png";

// Display-only labels for the panel — the internal company keys (Bayreuth, …)
// stay unchanged everywhere else (rosters, awards, EventPointsLog).
const COMPANY_DISPLAY = { Bayreuth: "Fusiliers" };
const companyLabel = (c) => COMPANY_DISPLAY[c] ?? c;

// Awarding is separated from running: COMMAND_PERMISSIONS gates who can RUN the
// command and open the panel (Petit État-Major), but only État-Major may click
// "Add Points" to approve the actual award.
function canAward(member) {
  return !!member && hasAnyRole(member, ROLE_ETAT_MAJOR);
}

// Render an eligible list as an embed field value, staying under Discord's 1024
// char field limit (spills into "…and N more" if a section is very large).
function listField(members) {
  if (!members.length) return "_None_";
  const lines = members.map((e) => `<@${e.discordId}> — ${e.name}`);
  let out = "";
  let shown = 0;
  for (const line of lines) {
    if (out.length + line.length + 1 > 980) break;
    out += (out ? "\n" : "") + line;
    shown++;
  }
  if (shown < lines.length) out += `\n…and ${lines.length - shown} more`;
  return out;
}

function buildPanelEmbed({ dateMD, isWeekend, companyPointValue, found, eligible, unmatched }) {
  const embed = new EmbedBuilder()
    .setColor(BAVARIAN_BLUE)
    .setTitle(`🎖️ Attendance Points — ${dateMD} (${isWeekend ? "Weekend" : "Weekday"})`)
    .setThumbnail(`attachment://${CREST_ATTACH}`)
    .setTimestamp();

  if (!found) {
    embed.setDescription(`No attendance column found for **${dateMD}** on the Input sheet. Nothing to award.`);
    return { embed, total: 0 };
  }

  embed.addFields({ name: "━━━━━━━━ 🏰 Companies ━━━━━━━━", value: "​" });
  for (const company of COMPANY_ORDER) {
    const members = eligible.filter((e) => e.company === company);
    embed.addFields({ name: `${companyLabel(company)} (${members.length})`, value: listField(members) });
  }

  embed.addFields({ name: "━━━━━━━━ ⚔️ Platoons ━━━━━━━━", value: "​" });
  for (const platoon of PLATOON_ORDER) {
    const members = eligible.filter((e) => e.platoon === platoon);
    embed.addFields({ name: `${platoon} (${members.length})`, value: listField(members) });
  }

  const skipped = unmatched.length
    ? `\n\n⚠️ Attended + in a company/platoon but no resolvable profile (skipped): ${unmatched.map((u) => u.name).join(", ")}`
    : "";
  embed.setDescription(
    (eligible.length
      ? `**${eligible.length}** member${eligible.length === 1 ? "" : "s"} attended today. Press **Add Points** to award — ` +
        `company **+${companyPointValue}**, platoon **+1** (both stack).`
      : "No eligible members to award today.") + skipped
  );
  return { embed, total: eligible.length };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add_event_points")
    .setDescription("Award attendance points to every company + platoon member who attended today"),

  async execute(interaction) {
    const data = await getEventPointCandidates();
    const { embed, total } = buildPanelEmbed(data);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("event_points_add").setLabel("Add Points").setStyle(ButtonStyle.Success).setDisabled(total === 0),
      new ButtonBuilder().setCustomId("event_points_close").setLabel("Close").setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
      embeds: [embed],
      files: [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })],
      components: [row],
    });
  },

  // Routed here from index.js for the event_points_add / event_points_close buttons.
  async handleButton(interaction) {
    if (!canAward(interaction.member)) {
      return interaction.reply({ content: "⛔ Only État-Major can award attendance points.", flags: 64 });
    }

    if (interaction.customId === "event_points_close") {
      return interaction.update({ components: [] }).catch(() => null);
    }
    if (interaction.customId !== "event_points_add") return;

    await interaction.deferUpdate();

    // Recompute at click time — never trust the (possibly stale) panel.
    const { dateMD, eligible } = await getEventPointCandidates();

    let awarded = [];
    try {
      awarded = await awardEventPoints(eligible); // [{ discordId, name, awarded, total }]
      await recordEventAwards({
        dateMD,
        officerId: interaction.user.id,
        awards: awarded.map((a) => ({ username: a.name, userId: a.discordId, points: a.awarded })),
      });
    } catch (err) {
      console.error("[add_event_points] award failed:", err.message);
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(BAVARIAN_BLUE).setTitle("🎖️ Attendance Points").setDescription("❌ Something went wrong while awarding points. No changes may have been saved — check the sheet before re-running.")],
        components: [],
        attachments: [],
      }).catch(() => null);
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(BAVARIAN_BLUE)
      .setTitle(`🎖️ Attendance Points Awarded — ${dateMD}`)
      .setTimestamp()
      .setDescription(
        awarded.length
          ? `✅ Awarded **${awarded.length}** member${awarded.length === 1 ? "" : "s"}:\n` +
            awarded.map((a) => `> <@${a.discordId}> — **+${a.awarded}** (now **${a.total}**)`).join("\n")
          : "No one was eligible to award."
      );

    await interaction.editReply({ embeds: [resultEmbed], components: [], attachments: [] }).catch(() => null);

    // DM each awarded member (closed DMs ignored).
    for (const a of awarded) {
      const { embed, files } = buildPointsAwardedEmbed({ amount: a.awarded, total: a.total });
      await interaction.client.users.fetch(a.discordId)
        .then((user) => user.send({ embeds: [embed], files }))
        .catch(() => null);
    }

    await logCommand({
      commandName: "add_event_points",
      officerId: interaction.user.id,
      reason: `attendance points (${dateMD}) to ${awarded.map((a) => `<@${a.discordId}> +${a.awarded}`).join(", ") || "(none)"}`,
    });
  },
};
