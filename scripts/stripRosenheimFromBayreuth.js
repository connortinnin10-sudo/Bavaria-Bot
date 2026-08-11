// One-off maintenance: ensure every Bayreuth roster member does NOT hold the
// Rosenheim company role. Reads Discord IDs from the Bayreuth company sheet
// (column K), then removes ROLE_ROSENHEIM from each member who still has it.
//
// Run:  node scripts/stripRosenheimFromBayreuth.js          (dry run, reports only)
//       node scripts/stripRosenheimFromBayreuth.js --apply  (actually removes)
const { Client, GatewayIntentBits } = require("discord.js");
const { getSheetsClient } = require("../src/sheets");
require("dotenv").config();

const SHEET_ID       = process.env.GOOGLE_SHEET_ID;
const GUILD_ID       = process.env.DISCORD_GUILD_ID || "1193239194395476008";
const BAYREUTH_GID   = 261215654;
const ROLE_ROSENHEIM = "1506735371353063555";
const APPLY          = process.argv.includes("--apply");

async function getBayreuthDiscordIds() {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const tab  = meta.data.sheets.find(s => s.properties.sheetId === BAYREUTH_GID);
  if (!tab) throw new Error(`No tab with GID ${BAYREUTH_GID}`);
  const tabName = tab.properties.title;

  // Bayreuth roster read window: rows 15–170, Discord ID at column K.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!K15:K170`,
  });
  const rows = res.data.values ?? [];
  const ids = rows
    .map(r => (r[0] ?? "").toString().trim().replace(/^'/, ""))
    .filter(id => /^\d{5,}$/.test(id));
  return { tabName, ids: [...new Set(ids)] };
}

async function main() {
  const { tabName, ids } = await getBayreuthDiscordIds();
  console.log(`Bayreuth tab: "${tabName}" — ${ids.length} Discord IDs found on roster.`);
  console.log(APPLY ? ">>> APPLY mode: roles WILL be removed.\n" : ">>> DRY RUN: no changes will be made. Pass --apply to remove.\n");

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  await client.login(process.env.DISCORD_TOKEN);
  await new Promise(res => client.once("ready", res));
  const guild = await client.guilds.fetch(GUILD_ID);

  const had = [], removed = [], clean = [], notFound = [], failed = [];

  for (const id of ids) {
    const member = await guild.members.fetch(id).catch(() => null);
    if (!member) { notFound.push(id); continue; }
    const tag = member.user.tag;
    if (!member.roles.cache.has(ROLE_ROSENHEIM)) { clean.push(`${tag} (${id})`); continue; }
    had.push(`${tag} (${id})`);
    if (APPLY) {
      try {
        await member.roles.remove(ROLE_ROSENHEIM, "Bayreuth member should not hold Rosenheim role");
        removed.push(`${tag} (${id})`);
        console.log(`  removed Rosenheim from ${tag} (${id})`);
      } catch (err) {
        failed.push(`${tag} (${id}) — ${err.message}`);
        console.log(`  FAILED ${tag} (${id}): ${err.message}`);
      }
    } else {
      console.log(`  would remove Rosenheim from ${tag} (${id})`);
    }
  }

  console.log("\n==== SUMMARY ====");
  console.log(`Roster IDs checked:        ${ids.length}`);
  console.log(`Already clean:             ${clean.length}`);
  console.log(`Had Rosenheim role:        ${had.length}`);
  console.log(`Removed:                   ${APPLY ? removed.length : "(dry run)"}`);
  console.log(`Failed to remove:          ${failed.length}`);
  console.log(`Not in server (skipped):   ${notFound.length}`);
  if (had.length)      console.log("\nHad Rosenheim:\n  " + had.join("\n  "));
  if (failed.length)   console.log("\nFailures:\n  " + failed.join("\n  "));
  if (notFound.length) console.log("\nNot found in server:\n  " + notFound.join(", "));

  await client.destroy();
}

main().catch(err => { console.error(err); process.exit(1); });
