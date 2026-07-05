async function getRobloxUsername(discordId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const apiKey  = process.env.BLOXLINK_API_KEY;

  console.log("[Bloxlink] apiKey present:", !!apiKey, "| length:", apiKey?.length, "| guildId:", guildId);

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 5000);

  try {
    // Try guild-specific endpoint first
    const res = await fetch(
      `https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordId}`,
      { headers: { "api-key": apiKey }, signal: controller.signal }
    );

    const data = await res.json();
    console.log("[Bloxlink] guild status:", res.status, "body:", JSON.stringify(data));

    if (res.ok) {
      if (data.resolved?.roblox?.name) return data.resolved.roblox.name;
      if (data.robloxID) {
        const robloxRes = await fetch(`https://users.roblox.com/v1/users/${data.robloxID}`, { signal: controller.signal });
        if (robloxRes.ok) {
          const robloxData = await robloxRes.json();
          return robloxData.name ?? null;
        }
      }
    }

    // Fall back to global endpoint
    const globalRes = await fetch(
      `https://api.blox.link/v4/public/discord-to-roblox/${discordId}`,
      { headers: { "api-key": apiKey }, signal: controller.signal }
    );

    const globalData = await globalRes.json();
    console.log("[Bloxlink] global status:", globalRes.status, "body:", JSON.stringify(globalData));

    if (!globalRes.ok) return null;
    if (globalData.resolved?.roblox?.name) return globalData.resolved.roblox.name;
    if (!globalData.robloxID) return null;

    const robloxRes = await fetch(`https://users.roblox.com/v1/users/${globalData.robloxID}`, { signal: controller.signal });
    if (!robloxRes.ok) return null;
    const robloxData = await robloxRes.json();
    return robloxData.name ?? null;

  } catch (err) {
    console.error("[Bloxlink] fetch error:", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getRobloxUsername };
