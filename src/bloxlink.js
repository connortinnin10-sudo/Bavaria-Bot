async function getRobloxUsername(discordId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const apiKey  = process.env.BLOXLINK_API_KEY;
  const res = await fetch(
    `https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordId}`,
    { headers: { "api-key": apiKey } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.resolved?.roblox?.name ?? null;
}

module.exports = { getRobloxUsername };
