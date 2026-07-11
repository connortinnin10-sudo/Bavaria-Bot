const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

const EMBED_COLOR   = 0x1E5AA8; // Bavarian blue
const CREST_PATH    = "./assets/regiment-crest.png";
const CREST_ATTACH  = "regiment-crest.png";

const CHANNEL_IDS = {
  eventSchedule:    "1196471131960516618",
  deploymentOrders: "1193817790440812616",
  bulletin:         "1196472533025820766",
  fieldManual:      "1193819667505107024",
};

function formatStaffLine({ position, discordId, name }) {
  const tag = discordId ? `<@${discordId}>` : name;
  return `*${position}*, ${tag}`;
}

function buildWelcomeEmbed({ userId, company, staff }) {
  const mention      = `<@${userId}>`;
  const companyLabel = `FÜSILIER-KOMPANIE ${company.toUpperCase()}`;

  const description = [
    `**━**`,
    ``,
    `🥁 **REGIMENT ORDERS!**`,
    `Conscript ${mention},`,
    `You are assigned to ${companyLabel}, you will conduct yourself in accordance with regimental regulations and the orders of your superiors.`,
    ``,
    `As part of Bavaria's contingent within the Grande Armée, you march in service to His Imperial Majesty, Emperor Napoleon I. The reputation of the regiment rests upon the discipline and conduct of every soldier.`,
    ``,
    `📅 Event Schedule — <#${CHANNEL_IDS.eventSchedule}>`,
    `Review upcoming drills, inspections, and engagements.`,
    ``,
    `⚔️ Deployment Orders — <#${CHANNEL_IDS.deploymentOrders}>`,
    `All battle musters and official deployments shall be posted here.`,
    ``,
    `📢 Regimental Bulletin — <#${CHANNEL_IDS.bulletin}>`,
    `Orders from the État-Major, promotions, commendations, and official notices.`,
    ``,
    `📖 Field Manual — <#${CHANNEL_IDS.fieldManual}>`,
    `A guide for every Bavarian soldier, detailing rank progression, regulations, and military customs.`,
    ``,
    `**-**`,
    ``,
    `📯 **KOMPANIE ASSIGNMENT**`,
    ``,
    `You have been assigned to ${companyLabel}, where you shall drill, campaign, and fight alongside your fellow Bavarians. Your officers have been entrusted with your instruction and welfare. Should you **require guidance**, report to your company staff.`,
    ``,
    `🌿 *Etat Major*`,
    ...staff.etatMajor.map(formatStaffLine),
    ``,
    `🌿 *Petit Etat Major*`,
    ...staff.petitEtatMajor.map(formatStaffLine),
    ``,
    `**-**`,
    ``,
    `🎖️ **ADVANCEMENT, HONOURS, AWARDS**`,
    ``,
    `Every veteran once stood where you stand today. Upon proving yourself in one official battle, you shall earn your first promotion to the rank of Soldat.`,
    ``,
    `Beyond that, advancement is awarded to those who distinguish themselves through steadfast attendance, discipline, loyalty, and exemplary conduct both on and off the field. You can expect to see promotions listed weekly.`,
    ``,
    `**━**`,
    ``,
    `The regiment marches as one, and every soldier strengthens its line. Carry yourself with honor, obey your officers, and stand firm beneath the Bavarian colors.`,
    ``,
    `Welcome to the 2. Linien-Infanterie-Regiment "Kronprinz", ${mention}.`,
    ``,
    `Vive la France!`,
    `In Treue für König und Bayern!`,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Welcome to the 2. Linien-Infanterie-Regiment "Kronprinz"`)
    .setThumbnail(`attachment://${CREST_ATTACH}`)
    .setDescription(description);

  const files = [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })];

  return { embed, files };
}

module.exports = { buildWelcomeEmbed };
