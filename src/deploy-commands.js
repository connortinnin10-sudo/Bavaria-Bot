const { REST, Routes } = require("discord.js");
require("dotenv").config();

const commands = [
  require("./commands/enlist").data.toJSON(),
  require("./commands/userExile").data.toJSON(),
  require("./commands/userClearExile").data.toJSON(),
  require("./commands/stats").data.toJSON(),
  require("./commands/departmentAdd").data.toJSON(),
  require("./commands/departmentRemove").data.toJSON(),
  require("./commands/userRankChange").data.toJSON(),
  require("./commands/userAddPoint").data.toJSON(),
  require("./commands/userRemovePoint").data.toJSON(),
  require("./commands/currentPromotions").data.toJSON(),
  require("./commands/userReserve").data.toJSON(),
  require("./commands/transferCompany").data.toJSON(),
  require("./commands/userAssignSpecialization").data.toJSON(),
  require("./commands/userRemoveSpecialization").data.toJSON(),
  require("./commands/recruitAdd").data.toJSON(),
  require("./commands/recruitRemove").data.toJSON(),
  require("./commands/recruitClearSheet").data.toJSON(),
  require("./commands/userAccountability").data.toJSON(),
  require("./commands/userAccountabilityRemove").data.toJSON(),
  require("./commands/demeritAdd").data.toJSON(),
  require("./commands/demeritRemove").data.toJSON(),
  require("./commands/demeritRemoveAll").data.toJSON(),
  require("./commands/honoursSync").data.toJSON(),
  require("./commands/userAddPlatoon").data.toJSON(),
  require("./commands/userRemovePlatoon").data.toJSON(),
  require("./commands/addPlatoonPoints").data.toJSON(),
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
