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
  require("./src/commands/promoteUser"),
  require("./src/commands/demoteUser"),
  require("./src/commands/userAccountability"),
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

client.once("ready", () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  runDailyCheck();
  setInterval(runDailyCheck, 24 * 60 * 60 * 1000);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

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

client.login(process.env.DISCORD_TOKEN);
