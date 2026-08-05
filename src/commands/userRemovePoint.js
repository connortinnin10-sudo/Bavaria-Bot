const { SlashCommandBuilder } = require("discord.js");
const { addPoints } = require("../sheets");
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

    const updated   = [];
    const noProfile = [];
    for (const id of ids) {
      const result = await addPoints(id, -amount).catch((err) => {
        console.error("[user_remove_point] addPoints failed for", id, err.message);
        return null;
      });
      if (result) updated.push({ id, ...result });
      else noProfile.push(id);
    }

    const lines = [];
    if (updated.length) {
      lines.push(`✅ **-${amount}** point${amount === 1 ? "" : "s"} from:`);
      for (const u of updated) {
        lines.push(`> <@${u.id}> — **${u.points}**${u.ready ? " • 🎖️ Ready for promotion" : ""}`);
      }
    }
    if (noProfile.length) {
      lines.push(`⚠️ No points profile (not a company member): ${noProfile.map((id) => `<@${id}>`).join(", ")}`);
    }

    // Rich audit log: officer, amount, and every member it was applied to.
    await logCommand({
      commandName: "user_remove_point",
      officerId: interaction.user.id,
      reason: `-${amount} from ${updated.map((u) => `<@${u.id}>`).join(", ") || "(none)"}` +
              (noProfile.length ? ` | skipped (no profile): ${noProfile.map((id) => `<@${id}>`).join(", ")}` : ""),
    });

    return interaction.editReply({ content: lines.join("\n") });
  },
};
