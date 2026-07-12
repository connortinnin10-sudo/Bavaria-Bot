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

module.exports = {
  buildDemeritAddEmbed,
  buildDemeritRemoveEmbed,
  buildDemeritResetEmbed,
  buildLoaApprovedEmbed,
  buildLoaActiveEmbed,
  buildLoaRemovedEmbed,
  buildLoaEndedEmbed,
  buildExileEmbed,
  buildExileClearedEmbed,
};
