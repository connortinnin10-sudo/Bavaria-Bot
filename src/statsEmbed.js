const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { renderPromotionBar } = require("./progressBar");

const FLAG_PATH   = "./assets/bavaria-flag.png";
const FLAG_ATTACH = "bavaria-flag.png";
const BAR_ATTACH  = "promotion-bar.png";

const BAVARIAN_BLUE = 0x1E5AA8;

// Enlisted rank ladder, lowest → highest. The promotion bar fills to the
// member's tier on this ladder. NOTE: this is career-tier progression, not
// sub-rank progress — there's no Advancement-Points data stored yet. When that
// system is built, swap out ladderProgress() for the real percentage.
const ENLISTED_LADDER = [
  "Conscript",
  "Soldat",
  "Soldat de Premier",
  "Caporal",
  "Caporal de Premier",
  "Caporal-Fourrier",
];

// lowercase, collapse accents/punctuation/spacing so "Caporal‑Fourrier",
// "Caporal-Fourrier", and "caporal fourrier" all compare equal.
function normalizeRank(rank) {
  return (rank ?? "")
    .toString()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ladderProgress(rank) {
  const target = normalizeRank(rank);
  const idx = ENLISTED_LADDER.findIndex((r) => normalizeRank(r) === target);

  // Unknown rank, or the top of the ladder (incl. anyone above it) → full bar.
  if (idx === -1 || idx === ENLISTED_LADDER.length - 1) {
    return { percent: 100, nextRank: null };
  }
  return {
    percent: Math.round((idx / (ENLISTED_LADDER.length - 1)) * 100),
    nextRank: ENLISTED_LADDER[idx + 1],
  };
}

// /my_stats — the member's personal service record as an embed.
// `progress` (optional) is getPromotionProgress() from the promotion-points
// system: when present it drives the bar with the real points percentage
// (points ÷ this rank's threshold); otherwise we fall back to career-tier
// ladder position (the pre-points placeholder, and for non-company members).
function buildPersonalStatsEmbed(stats, progress = null) {
  const departments = (stats.departments ?? []).length
    ? stats.departments.join("\n")
    : "None";

  const loa = stats.loaActive ? "🟢 Active" : "⚪ Inactive";

  let percent, nextRank;
  if (progress) {
    percent  = progress.pct;
    nextRank = progress.atCeiling ? null : progress.nextRank;
  } else {
    ({ percent, nextRank } = ladderProgress(stats.rank));
  }
  const promotion = nextRank
    ? `**${stats.rank}**  →  ${nextRank}  •  **${percent}%**`
    : `**${stats.rank}**  •  Highest enlisted rank`;

  const embed = new EmbedBuilder()
    .setColor(BAVARIAN_BLUE)
    .setTitle(`📜 Personal Stats — ${stats.username}`)
    .setThumbnail(`attachment://${FLAG_ATTACH}`)
    .addFields(
      { name: "Rank",        value: `${stats.rank}`,        inline: true },
      { name: "Company",     value: `${stats.company}`,     inline: true },
      { name: "KPE",         value: `${stats.kpe}`,         inline: true },
      { name: "Activity",    value: `${stats.activity}`,    inline: true },
      { name: "Total Kills", value: `${stats.kills}`,       inline: true },
      { name: "Demerits",    value: `${stats.demerits ?? 0} / 3`, inline: true },
      { name: "LOA",         value: loa,                    inline: true },
      { name: "Departments", value: departments,            inline: false },
      { name: "Promotion",   value: promotion,              inline: false },
    )
    .setImage(`attachment://${BAR_ATTACH}`)
    .setFooter({ text: "2ᵉ Régiment Bavarois" })
    .setTimestamp();

  const files = [
    new AttachmentBuilder(FLAG_PATH, { name: FLAG_ATTACH }),
    new AttachmentBuilder(renderPromotionBar(percent), { name: BAR_ATTACH }),
  ];

  return { embed, files };
}

module.exports = { buildPersonalStatsEmbed };
