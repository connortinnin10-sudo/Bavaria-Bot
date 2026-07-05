const { Client, GatewayIntentBits, Collection } = require("discord.js");
const { clearExpiredAccountabilities } = require("./src/sheets");
require("dotenv").config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

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

async function runDailyCheck() {
  try {
    const cleared = await clearExpiredAccountabilities();
    if (cleared > 0) console.log(`Cleared ${cleared} expired accountability record(s).`);
  } catch (err) {
    console.error("Accountability check error:", err.message);
  }
}

function scheduleMidnightCheck() {
  const now = new Date();
  const next = new Date();
  next.setHours(24, 0, 0, 0); // next midnight
  const msUntilMidnight = next - now;
  setTimeout(() => {
    runDailyCheck();
    setInterval(runDailyCheck, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

client.once("ready", () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  runDailyCheck();
  scheduleMidnightCheck();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Discard stale interactions replayed after a bot restart
  if (Date.now() - interaction.createdTimestamp > 2500) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  const verifiedRoleId = process.env.VERIFIED_ROLE_ID;

  // Block command executor if they don't have the verified role
  if (verifiedRoleId && !interaction.member.roles.cache.has(verifiedRoleId)) {
    return interaction.reply({ content: "❌ You do not have permission to use this command.", flags: 64 });
  }

  // Block if the target user doesn't have the verified role (cache only — no network call before deferReply)
  const targetUser = interaction.options.getUser("user");
  if (targetUser && verifiedRoleId) {
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    if (targetMember && !targetMember.roles.cache.has(verifiedRoleId)) {
      return interaction.reply({ content: "❌ That user does not have the verified role and cannot be targeted by this command.", flags: 64 });
    }
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    try {
      const msg = { content: "An error occurred. Please try again.", flags: 64 };
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
