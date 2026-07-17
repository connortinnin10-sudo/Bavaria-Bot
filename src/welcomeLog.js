// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ANNOUNCEMENT WEBHOOKS  (NOT the admin command log — that's
// LOG_WEBHOOK_URL in commandLog.js). Each MUST be set in the Railway dashboard,
// not just .env, or it silently no-ops in production. Three kinds:
//
//  1. Company transfer welcomes — one per company, posted when a member LANDS in
//     that company (via /transfer_company or a veteran /user_enlist):
//       Rosenheim → ROSENHEIM_WEBHOOK_URL
//       Bayreuth  → BAYREUTH_WEBHOOK_URL
//       (Grenadier: add GRENADIER_WEBHOOK_URL here + set the var — no other change)
//
//  2. Regiment enlistment log — ENLISTMENT_WEBHOOK_URL — posted when /user_enlist
//     is run on someone (their initial join, distinct from a company transfer).
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

const enlistmentWebhook = process.env.ENLISTMENT_WEBHOOK_URL
  ? new WebhookClient({ url: process.env.ENLISTMENT_WEBHOOK_URL }, { rest: { retries: 0 } })
  : (console.warn("[welcomeLog] ENLISTMENT_WEBHOOK_URL not set — enlistment log disabled"), null);

// Fires when /user_enlist is run on someone — logs their initial join to the
// regiment. This is an enlistment, not a transfer, so it reads differently.
async function sendEnlistmentLog({ userId }) {
  if (!enlistmentWebhook) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(WELCOME_COLOR)
      .setTitle("New Enlistment")
      .setThumbnail(`attachment://${CREST_ATTACH}`)
      .setDescription(`<@${userId}> has enlisted into the regiment. Welcome them!`)
      .setTimestamp();
    const files = [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })];
    await enlistmentWebhook.send({ embeds: [embed], files });
  } catch (err) {
    console.error("[welcomeLog] Failed to send enlistment log:", err.message);
  }
}

module.exports = { sendCompanyWelcome, sendEnlistmentLog };
