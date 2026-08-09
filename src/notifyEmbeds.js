const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

const CREST_PATH   = "./assets/regiment-crest.png";
const CREST_ATTACH = "regiment-crest.png";

const BAVARIAN_BLUE = 0x1E5AA8;
const SUCCESS_GREEN  = 0x639922;
const EXILE_RED       = 0x8B0000;

// Mirrors the demerit severity ramp used for cell-coloring in sheets.js (DEMERIT_COLORS)
const DEMERIT_EMBED_COLORS = {
  1: 0xEA9999,
  2: 0xDF6665,
  3: 0xCC0100,
};

function buildEmbed(color, title, description) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setThumbnail(`attachment://${CREST_ATTACH}`)
    .setDescription(description);

  const files = [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })];

  return { embed, files };
}

// /demerit_add
function buildDemeritAddEmbed({ count, reason, officerId }) {
  const description = count >= 3
    ? [
        `⚠️ You have received demerit **3/3** for: *${reason}*`,
        `You've received 3/3 demerits. You're currently pending to be transferred to the regiment's reserve company. To contest this, contact <@${officerId}>.`,
      ].join("\n")
    : [
        `⚠️ You have received demerit **${count}/3** for: *${reason}*`,
        `To contest this demerit, contact <@${officerId}>.`,
      ].join("\n");

  return buildEmbed(DEMERIT_EMBED_COLORS[Math.min(count, 3)] ?? DEMERIT_EMBED_COLORS[1], "Demerit Issued", description);
}

// /demerit_remove
function buildDemeritRemoveEmbed({ count, reason, officerId }) {
  const description = count === 0
    ? `✅ A demerit has been removed by <@${officerId}> for: *${reason}*. You now have no demerits.`
    : `✅ A demerit has been removed by <@${officerId}> for: *${reason}*. You are now at **${count}/3** demerits.`;

  return buildEmbed(SUCCESS_GREEN, "Demerit Removed", description);
}

// /demerit_remove_all
function buildDemeritResetEmbed() {
  return buildEmbed(SUCCESS_GREEN, "Demerits Reset", "✅ Your demerits have been reset. You now have 0/3 demerits!");
}

// /user_loa — future-dated leave date (approved now, not yet active)
function buildLoaApprovedEmbed({ leaveDate, returnDate, reason, officerId }) {
  const description = [
    `Your LOA has been approved for ${leaveDate} – ${returnDate}.`,
    `> **Reason:** ${reason}`,
    `> **Approved by:** <@${officerId}>`,
  ].join("\n");

  return buildEmbed(BAVARIAN_BLUE, "LOA Approved", description);
}

// /user_loa (leave date is today) and the automatic midnight activation in index.js
function buildLoaActiveEmbed({ leaveDate, returnDate, reason, officerId }) {
  const description = [
    `✅ Your LOA is now active.`,
    `> **Leave:** ${leaveDate}`,
    `> **Return:** ${returnDate}`,
    ...(reason ? [`> **Reason:** ${reason}`] : []),
    ...(officerId ? [`> **Approved by:** <@${officerId}>`] : []),
  ].join("\n");

  return buildEmbed(BAVARIAN_BLUE, "LOA Active", description);
}

// /user_loa_remove — officer-initiated early removal
function buildLoaRemovedEmbed({ reason, officerId }) {
  const description = [
    `Your LOA has been removed.`,
    `> **Reason:** ${reason}`,
    `> **Removed by:** <@${officerId}>`,
  ].join("\n");

  return buildEmbed(BAVARIAN_BLUE, "LOA Removed", description);
}

// Automatic midnight expiration in index.js — natural completion, not officer-initiated
function buildLoaEndedEmbed({ leaveDate, returnDate }) {
  const description = `Your LOA from ${leaveDate} to ${returnDate} has ended.`;
  return buildEmbed(BAVARIAN_BLUE, "LOA Ended", description);
}

// /user_exile
function buildExileEmbed({ reason, officerId }) {
  const description = [
    `⛔ You have been exiled from the regiment by <@${officerId}>.`,
    `> **Reason:** ${reason}`,
    `You cannot be re-enlisted or have any commands run on you until your exile is lifted.`,
  ].join("\n");

  return buildEmbed(EXILE_RED, "Exiled", description);
}

// /user_clear_exile
function buildExileClearedEmbed({ officerId }) {
  const description = [
    `✅ Your exile has been lifted by <@${officerId}>.`,
    `You may now be re-enlisted or have commands run on you again.`,
  ].join("\n");

  return buildEmbed(SUCCESS_GREEN, "Exile Lifted", description);
}

// /department_add — Recruitment / Propaganda
function buildDepartmentAddedEmbed({ department, officerId }) {
  const description = [
    `✅ You have been added to **${department}**.`,
    `> **Approved by:** <@${officerId}>`,
  ].join("\n");

  return buildEmbed(BAVARIAN_BLUE, "Added to Department", description);
}

// /department_add (Flag) — flag members carry a position and represent a company,
// so they get a richer embed than the generic department one above.
function buildFlagDepartmentAddedEmbed({ position, company, officerId }) {
  const description = [
    `✅ You have been added to the **Flag Department**.`,
    `> **Position:** ${position}`,
    `> **Representing:** ${company}`,
    `> **Approved by:** <@${officerId}>`,
  ].join("\n");

  return buildEmbed(BAVARIAN_BLUE, "Added to Flag Department", description);
}

// /department_remove
function buildDepartmentRemovedEmbed({ department, officerId }) {
  const description = [
    `You have been removed from **${department}**.`,
    `> **Approved by:** <@${officerId}>`,
  ].join("\n");

  return buildEmbed(BAVARIAN_BLUE, "Removed from Department", description);
}

// /user_add_platoon — DM to a member added to a platoon.
function buildPlatoonAddedEmbed({ platoon, officerId }) {
  const description = [
    `✅ You have been added to the **${platoon}** platoon.`,
    `> **Approved by:** <@${officerId}>`,
    "",
    "Attend platoon events to earn promotion points. Check your progress with `/my_stats`.",
  ].join("\n");

  return buildEmbed(BAVARIAN_BLUE, "Added to Platoon", description);
}

// /user_add_point — DM to a member who was awarded promotion points.
function buildPointsAwardedEmbed({ amount, total }) {
  const description = [
    `📈 You've received **+${amount}** promotion point${amount === 1 ? "" : "s"}` +
      (total != null ? ` — you're now at **${total}**.` : "."),
    "Check your progress with `/my_stats`.",
  ].join("\n");

  return buildEmbed(BAVARIAN_BLUE, "Points Received", description);
}

// /current_promotions — DM to a member who was promoted.
function buildPromotionEmbed({ username, rank, nextThreshold }) {
  const nextLine = nextThreshold != null
    ? `Your points have been reset — you'll need **${nextThreshold}** points to reach your next promotion.`
    : "You've reached the **highest enlisted rank** — further promotions are at officer discretion.";

  const description = [
    `🎖️ Congratulations, **${username}** — you've been promoted to **${rank}**!`,
    nextLine,
    "",
    "If you're looking to progress faster, it's encouraged you join a platoon or a department. " +
      "The more effort you put into this regiment, the quicker you'll receive the results!",
  ].join("\n");

  return buildEmbed(SUCCESS_GREEN, "Promotion", description);
}

// /recruit_add — DM to a recruiter whose recruit was logged (awards 1 point).
function buildRecruitLoggedEmbed() {
  return buildEmbed(
    BAVARIAN_BLUE,
    "Recruit Logged",
    "Your recruit has been logged. You've received **1** promotion point.\nCheck your progress with `/my_stats`."
  );
}

module.exports = {
  buildPlatoonAddedEmbed,
  buildPointsAwardedEmbed,
  buildPromotionEmbed,
  buildRecruitLoggedEmbed,
  buildDemeritAddEmbed,
  buildDemeritRemoveEmbed,
  buildDemeritResetEmbed,
  buildLoaApprovedEmbed,
  buildLoaActiveEmbed,
  buildLoaRemovedEmbed,
  buildLoaEndedEmbed,
  buildExileEmbed,
  buildExileClearedEmbed,
  buildDepartmentAddedEmbed,
  buildFlagDepartmentAddedEmbed,
  buildDepartmentRemovedEmbed,
};
