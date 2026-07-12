const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

const EMBED_COLOR   = 0x1E5AA8; // Bavarian blue
const CREST_PATH    = "./assets/regiment-crest.png";
const CREST_ATTACH  = "regiment-crest.png";

const CHANNEL_IDS = {
  eventSchedule:     "1196471131960516618",
  deploymentOrders:  "1193817790440812616",
  bulletin:          "1196472533025820766",
  fieldManual:       "1193819667505107024",
  enlistmentRequest: "1193817245407785000",
};

function formatStaffLine({ position, discordId, name }) {
  const tag = discordId ? `<@${discordId}>` : name;
  return `*${position}*, ${tag}`;
}

function buildEmbed(title, description) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(title)
    .setThumbnail(`attachment://${CREST_ATTACH}`)
    .setDescription(description);

  const files = [new AttachmentBuilder(CREST_PATH, { name: CREST_ATTACH })];

  return { embed, files };
}

function buildWelcomeEmbed({ userId, company, rank, staff }) {
  const mention      = `<@${userId}>`;
  const companyLabel = `**FÜSILIER-KOMPANIE ${company.toUpperCase()}**`;

  const description = [
    `**━**`,
    ``,
    `🥁 **REGIMENT ORDERS!**`,
    `${rank} ${mention},`,
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

  return buildEmbed(`Welcome to the 2. Linien-Infanterie-Regiment "Kronprinz"`, description);
}

function buildVeteranReserveEmbed({ userId }) {
  const mention = `<@${userId}>`;

  const description = [
    `Welcome, ${mention}, to the Bavarian Veteran Kompanie.`,
    ``,
    `As a veteran of the regiment, you have earned the privilege of serving within this distinguished kompanie. While no longer assigned to an active kompanie, you remain a valued member of the Bavarian Regiment. Your past service is recognized, and you are always welcome to return to the line should duty call once more.`,
    ``,
    `📅 Schedule — <#${CHANNEL_IDS.eventSchedule}>`,
    ``,
    `⚔️ Deployments — N/A`,
    ``,
    `📖 Reserve Information — N/A`,
    ``,
    `**-**`,
    ``,
    `## RETURNING TO ACTIVE DUTY`,
    ``,
    `Should you wish to leave retirement and return to active service, simply submit an enlistment request in <#${CHANNEL_IDS.enlistmentRequest}>.`,
    ``,
    `Upon acceptance, **all ranks of CAPORAL-FOURRIER and below will be restored**, and you will be assigned back to an active kompanie.`,
    ``,
    `⚠️ Staff ranks are **not guaranteed** to be restored and will only be reinstated if approved through prior negotiation with the Regimental Staff before re-enlistment.`,
    ``,
    `**-**`,
    ``,
    `Thank you for your continued service to Bavaria.`,
  ].join("\n");

  return buildEmbed("Welcome to the Bavarian Veteran Kompanie", description);
}

function buildMercenaryReserveEmbed({ userId }) {
  const mention = `<@${userId}>`;

  const description = [
    `Welcome, ${mention}, to the Bavarian Mercenary Kompanie.`,
    ``,
    `As a mercenary serving alongside the Bavarian Regiment, you have answered Bavaria's call to arms. Though you march under your own colors, you will stand shoulder to shoulder with our soldiers in battle.`,
    ``,
    `📅 Schedule — <#${CHANNEL_IDS.eventSchedule}>`,
    ``,
    `⚔️ Deployments — N/A`,
    ``,
    `📖 Mercenary Information — N/A`,
    ``,
    `**-**`,
    ``,
    `## MERCENARY SERVICE`,
    ``,
    `As a member of the Mercenary Kompanie, you are expected to follow the orders of the Bavarian chain of command while participating in our events. Professionalism, teamwork, and discipline are expected of all mercenaries serving alongside the regiment.`,
    ``,
    `Should you have any questions regarding mercenary policies or event participation, please contact a member of the Regimental Staff.`,
    ``,
    `**-**`,
    ``,
    `## ENLISTING INTO THE REGIMENT`,
    ``,
    `Should you decide to enlist as a permanent member of the Bavarian Regiment, simply submit an enlistment request in <#${CHANNEL_IDS.enlistmentRequest}>.`,
    ``,
    `Upon acceptance, you will be assigned to an active kompanie and begin your service at the rank of **SOLDAT**, where you'll have the opportunity to earn promotions through attendance, professionalism, and dedication to the regiment.`,
    ``,
    `**-**`,
    ``,
    `Thank you for answering Bavaria's call to arms.`,
    ``,
    `We look forward to fighting alongside you on the battlefield.`,
  ].join("\n");

  return buildEmbed("Welcome to the Bavarian Mercenary Kompanie", description);
}

module.exports = { buildWelcomeEmbed, buildVeteranReserveEmbed, buildMercenaryReserveEmbed };
