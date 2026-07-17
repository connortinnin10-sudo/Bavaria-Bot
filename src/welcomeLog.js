const { EmbedBuilder, AttachmentBuilder, WebhookClient } = require("discord.js");
require("dotenv").config();

const CREST_PATH    = "./assets/regiment-crest.png";
const CREST_ATTACH  = "regiment-crest.png";
const WELCOME_COLOR = 0x1E5AA8; // BAVARIAN_BLUE, same as notifyEmbeds.js

// Read from env only (never hardcode the URL — it's a credential that must not be
// committed). Like LOG_WEBHOOK_URL, this MUST be set in the Railway dashboard, not
// just .env, or the welcome silently no-ops in production (see CLAUDE.md).
let rosenheimWebhook = null;
if (process.env.ROSENHEIM_WEBHOOK_URL) {
  // retries: 0 — Discord's webhook execute endpoint has no idempotency key, so a
  // retry after a timeout can post a genuine duplicate (same reason as commandLog).
  rosenheimWebhook = new WebhookClient({ url: process.env.ROSENHEIM_WEBHOOK_URL }, { rest: { retries: 0 } });
} else {
  console.warn("[welcomeLog] ROSENHEIM_WEBHOOK_URL not set — Rosenheim welcome disabled");
}

// Fires when a member is transferred into Rosenheim, so the company can greet them.
async function sendRosenheimWelcome({ userId }) {
  if (!rosenheimWebhook) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(WELCOME_COLOR)
      .setTitle("New Rosenheim Transfer")
      .setThumbnail(`attachment://${CREST_ATTACH}`)
      .setDescription(`<@${userId}> has been transferred to **Rosenheim**. Welcome them to the regiment!`)
      .setTimestamp();
    const files = [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })];
    await rosenheimWebhook.send({ embeds: [embed], files });
  } catch (err) {
    console.error("[welcomeLog] Failed to send Rosenheim welcome:", err.message);
  }
}

module.exports = { sendRosenheimWelcome };
