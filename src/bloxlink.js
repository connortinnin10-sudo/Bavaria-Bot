async function getRobloxUsername(discordId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const apiKey  = process.env.BLOXLINK_API_KEY;

  const res = await fetch(
    `https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordId}`,
    { headers: { "api-key": apiKey } }
  );

  const data = await res.json();
  console.log("[Bloxlink] status:", res.status, "body:", JSON.stringify(data));

  if (!res.ok) return null;

  // Some responses include the full resolved object, others only robloxID
  if (data.resolved?.roblox?.name) return data.resolved.roblox.name;
  if (!data.robloxID) return null;

  // Fall back to Roblox API to get username from ID
  const robloxRes = await fetch(`https://users.roblox.com/v1/users/${data.robloxID}`);
  if (!robloxRes.ok) return null;
  const robloxData = await robloxRes.json();
  console.log("[Roblox] username lookup:", JSON.stringify(robloxData));
  return robloxData.name ?? null;
}

module.exports = { getRobloxUsername };
