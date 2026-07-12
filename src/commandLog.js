const { EmbedBuilder, AttachmentBuilder, WebhookClient } = require("discord.js");

const CREST_PATH   = "./assets/regiment-crest.png";
const CREST_ATTACH = "regiment-crest.png";
const LOG_COLOR    = 0x1E5AA8; // BAVARIAN_BLUE, same as notifyEmbeds.js

let webhookClient = null;
if (process.env.LOG_WEBHOOK_URL) {
  webhookClient = new WebhookClient({ url: process.env.LOG_WEBHOOK_URL });
} else {
  console.warn("[commandLog] LOG_WEBHOOK_URL not set — command logging disabled");
}

function buildCommandLogEmbed({ commandName, officerId, targetUser, reason }) {
  const lines = [`**Officer:** <@${officerId}>`];
  if (targetUser) lines.push(`**Target:** <@${targetUser.id}> (${targetUser.username})`);
  if (reason) lines.push(`**Reason:** ${reason}`);

  const embed = new EmbedBuilder()
    .setColor(LOG_COLOR)
    .setTitle(`/${commandName}`)
    .setThumbnail(`attachment://${CREST_ATTACH}`)
    .setDescription(lines.join("\n"))
    .setTimestamp();

  const files = [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })];

  return { embed, files };
}

async function logCommand({ commandName, officerId, targetUser, reason }) {
  if (!webhookClient) return;
  try {
    const { embed, files } = buildCommandLogEmbed({ commandName, officerId, targetUser, reason });
    await webhookClient.send({ embeds: [embed], files });
  } catch (err) {
    console.error("[commandLog] Failed to send log:", err.message);
  }
}

module.exports = { logCommand };
