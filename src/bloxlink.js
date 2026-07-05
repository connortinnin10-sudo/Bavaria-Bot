async function getRobloxUsername(discordId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const apiKey  = process.env.BLOXLINK_API_KEY;

  console.log("[Bloxlink] apiKey present:", !!apiKey, "| length:", apiKey?.length, "| guildId:", guildId);

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordId}`,
      { headers: { "api-key": apiKey }, signal: controller.signal }
    );

    const data = await res.json();
    console.log("[Bloxlink] status:", res.status, "body:", JSON.stringify(data));

    if (!res.ok) return null;

    if (data.resolved?.roblox?.name) return data.resolved.roblox.name;
    if (!data.robloxID) return null;

    // Fall back to Roblox API to get username from ID
    const robloxRes = await fetch(`https://users.roblox.com/v1/users/${data.robloxID}`, { signal: controller.signal });
    if (!robloxRes.ok) return null;
    const robloxData = await robloxRes.json();
    console.log("[Roblox] username lookup:", JSON.stringify(robloxData));
    return robloxData.name ?? null;
  } catch (err) {
    console.error("[Bloxlink] fetch error:", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getRobloxUsername };
