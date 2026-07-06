const { setDefaultResultOrder } = require("dns");
setDefaultResultOrder("ipv4first"); // prevent IPv6 fallback delay on Railway

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const { clearExpiredAccountabilities } = require("./src/sheets");
require("dotenv").config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages] });

client.commands = new Collection();

const commands = [
  require("./src/commands/enlist"),
  require("./src/commands/regimentRemove"),
  require("./src/commands/stats"),
  require("./src/commands/addDepartment"),
  require("./src/commands/departmentRemove"),
  require("./src/commands/userRankChange"),
  require("./src/commands/userReserve"),
  require("./src/commands/recruitAdd"),
  require("./src/commands/recruitRemove"),
  require("./src/commands/recruitClearSheet"),
  require("./src/commands/userAccountability"),
  require("./src/commands/userAccountabilityRemove"),
  require("./src/commands/demeritAdd"),
  require("./src/commands/demeritRemove"),
  require("./src/commands/demeritRemoveAll"),
];

for (const command of commands) {
  client.commands.set(command.data.name, command);
}

function msUntilEstMidnight() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric", minute: "numeric", second: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const elapsed = (parseInt(p.hour, 10) % 24) * 3600000 +
                  parseInt(p.minute, 10) * 60000 +
                  parseInt(p.second, 10) * 1000;
  return 24 * 60 * 60 * 1000 - elapsed;
}

async function runDailyCheck(client) {
  try {
    const { activated, deactivated } = await clearExpiredAccountabilities();
    const delay = ms => new Promise(r => setTimeout(r, ms));

    for (const entry of activated) {
      try {
        const user = await client.users.fetch(entry.userId);
        await user.send(`✅ Your LOA is now active.\n> **Leave:** ${entry.leaveDate}\n> **Return:** ${entry.returnDate}`);
      } catch {}
      await delay(500);
    }

    for (const entry of deactivated) {
      try {
        const user = await client.users.fetch(entry.userId);
        await user.send("✅ Your LOA has ended — welcome back!");
      } catch {}
      await delay(500);
    }

    if (activated.length > 0)   console.log(`Activated ${activated.length} LOA(s).`);
    if (deactivated.length > 0) console.log(`Cleared ${deactivated.length} expired LOA(s).`);
  } catch (err) {
    console.error("Accountability check error:", err.message);
  }
}

function scheduleMidnightCheck(client) {
  setTimeout(async () => {
    await runDailyCheck(client);
    scheduleMidnightCheck(client);
  }, msUntilEstMidnight());
}

client.once("ready", async () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  await client.application.fetch().catch(() => {});
  runDailyCheck(client);
  scheduleMidnightCheck(client);
});

const handledInteractions = new Set();

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Deduplicate replayed interactions (gateway resume can replay the same ID)
  if (handledInteractions.has(interaction.id)) return;
  handledInteractions.add(interaction.id);


  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  const verifiedRoleId = process.env.VERIFIED_ROLE_ID;

  // Block command executor if they don't have the verified role
  if (verifiedRoleId && !interaction.member.roles.cache.has(verifiedRoleId)) {
    return interaction.reply({ content: "❌ You do not have permission to use this command.", flags: 64 });
  }

  try {
    await interaction.deferReply(command.ephemeral === false ? {} : { flags: 64 });
    await command.execute(interaction);
  } catch (err) {
    if (err?.code === 10062) return; // interaction expired — nothing to reply to
    console.error(err);
    try {
      const msg = { content: `❌ Error: ${err?.message ?? String(err)}`, flags: 64 };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (replyErr) {
      console.error("Failed to send error reply:", replyErr.message);
    }
  }
});

const token = process.env.DISCORD_TOKEN;
console.log("[DEBUG] Token length:", token?.length, "| starts with quote:", token?.startsWith('"'));
client.login(token);
