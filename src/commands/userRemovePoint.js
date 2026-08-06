const { SlashCommandBuilder } = require("discord.js");
const { awardPoints } = require("../sheets");
const { POINTS_SYSTEM_ENABLED } = require("../permissions");
const { logCommand } = require("../commandLog");

// Discord snowflake IDs are 17-20 digits; pull every id out of the `users`
// string whether it was a mention (<@123> / <@!123>) or a bare id.
function parseUserIds(raw) {
  return [...new Set((raw ?? "").match(/\d{17,20}/g) ?? [])];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_remove_point")
    .setDescription("Remove promotion points from one or more members (1-5)")
    .addStringOption((opt) =>
      opt.setName("users").setDescription("Tag one or more members").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("amount").setDescription("Points to remove per member (1-5)").setRequired(true).setMinValue(1).setMaxValue(5)
    ),

  async execute(interaction) {
    if (!POINTS_SYSTEM_ENABLED) {
      return interaction.editReply({ content: "⚠️ The promotion points system is temporarily disabled." });
    }

    const ids    = parseUserIds(interaction.options.getString("users"));
    const amount = interaction.options.getInteger("amount");

    if (ids.length === 0) {
      return interaction.editReply({ content: "❌ No members tagged. Mention at least one member in the `users` field." });
    }

    const updated      = [];
    const notInCompany = [];
    for (const id of ids) {
      const res = await awardPoints(id, -amount).catch((err) => {
        console.error("[user_remove_point] awardPoints failed for", id, err.message);
        return { status: "error" };
      });
      if (res.status === "ok") updated.push({ id, ...res });
      else notInCompany.push(id);
    }

    const lines = [];
    if (updated.length) {
      lines.push(`✅ **-${amount}** point${amount === 1 ? "" : "s"} from:`);
      for (const u of updated) {
        lines.push(`> <@${u.id}> — **${u.points}**${u.ready ? " • 🎖️ Ready for promotion" : ""}`);
      }
    }
    if (notInCompany.length) {
      lines.push(`⚠️ Not on a company roster (Bayreuth / Rosenheim / Grenadier) — skipped: ${notInCompany.map((id) => `<@${id}>`).join(", ")}`);
    }
    if (!updated.length && !notInCompany.length) {
      lines.push("Nothing to do.");
    }

    // Rich audit log: officer, amount, and every member it was applied to.
    await logCommand({
      commandName: "user_remove_point",
      officerId: interaction.user.id,
      reason: `-${amount} from ${updated.map((u) => `<@${u.id}>`).join(", ") || "(none)"}` +
              (notInCompany.length ? ` | skipped (not in a company): ${notInCompany.map((id) => `<@${id}>`).join(", ")}` : ""),
    });

    return interaction.editReply({ content: lines.join("\n") });
  },
};
