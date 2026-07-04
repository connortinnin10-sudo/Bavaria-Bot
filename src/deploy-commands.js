const { REST, Routes } = require("discord.js");
require("dotenv").config();

const commands = [
  require("./commands/enlist").data.toJSON(),
  require("./commands/regimentRemove").data.toJSON(),
  require("./commands/stats").data.toJSON(),
  require("./commands/addDepartment").data.toJSON(),
  require("./commands/departmentRemove").data.toJSON(),
  require("./commands/userRankChange").data.toJSON(),
  require("./commands/userReserve").data.toJSON(),
  require("./commands/recruitAdd").data.toJSON(),
  require("./commands/userAccountability").data.toJSON(),
  require("./commands/userAccountabilityRemove").data.toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );
    console.log("Slash commands registered successfully.");
  } catch (err) {
    console.error(err);
  }
})();
