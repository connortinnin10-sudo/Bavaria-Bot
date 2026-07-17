// ─────────────────────────────────────────────────────────────────────────────
// COMPANY TRANSFER/ENLISTMENT WEBHOOKS  (one per company)
// Announces new arrivals into a company so its members can welcome them. A company
// only posts if its webhook env var is set; unset companies silently no-op.
// NOT the admin/command-log webhook — that's LOG_WEBHOOK_URL in commandLog.js.
//   Rosenheim → ROSENHEIM_WEBHOOK_URL
//   Bayreuth  → BAYREUTH_WEBHOOK_URL
//   (Grenadier: add GRENADIER_WEBHOOK_URL here + set the var to enable — no other change)
// Each MUST be set in the Railway dashboard, not just .env, or it no-ops in prod.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, AttachmentBuilder, WebhookClient } = require("discord.js");
require("dotenv").config();

const CREST_PATH    = "./assets/regiment-crest.png";
const CREST_ATTACH  = "regiment-crest.png";
const WELCOME_COLOR = 0x1E5AA8; // BAVARIAN_BLUE, same as notifyEmbeds.js

const COMPANY_WEBHOOK_URLS = {
  Rosenheim: process.env.ROSENHEIM_WEBHOOK_URL,
  Bayreuth:  process.env.BAYREUTH_WEBHOOK_URL,
};

// Build one WebhookClient per company that has a URL configured.
// retries: 0 — Discord's webhook execute endpoint has no idempotency key, so a
// retry after a timeout can post a genuine duplicate (same reason as commandLog).
const webhooks = {};
for (const [company, url] of Object.entries(COMPANY_WEBHOOK_URLS)) {
  if (url) {
    webhooks[company] = new WebhookClient({ url }, { rest: { retries: 0 } });
  } else {
    console.warn(`[welcomeLog] No webhook set for ${company} — its welcome is disabled`);
  }
}

// Fires when a member lands in a company, so that company can greet them.
// No-ops for any company without a configured webhook.
async function sendCompanyWelcome({ company, userId }) {
  const webhook = webhooks[company];
  if (!webhook) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(WELCOME_COLOR)
      .setTitle(`New ${company} Transfer`)
      .setThumbnail(`attachment://${CREST_ATTACH}`)
      .setDescription(`<@${userId}> has been transferred to **${company}**. Welcome them to the company!`)
      .setTimestamp();
    const files = [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })];
    await webhook.send({ embeds: [embed], files });
  } catch (err) {
    console.error(`[welcomeLog] Failed to send ${company} welcome:`, err.message);
  }
}

module.exports = { sendCompanyWelcome };
