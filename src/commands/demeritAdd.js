const { SlashCommandBuilder } = require("discord.js");
const { findUser, getDemeritCount, addDemerit } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("demerit_add")
    .setDescription("Issue a demerit to a regiment member")
    .addUserOption(opt =>
      opt.setName("user").setDescription("The member to demerit").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("reason").setDescription("Reason for the demerit").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const officerRoleId = process.env.DEMERIT_OFFICER_ROLE_ID;
    if (officerRoleId && !interaction.member.roles.cache.has(officerRoleId)) {
      return interaction.editReply({ content: "❌ You do not have permission to use this command." });
    }

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const reason       = interaction.options.getString("reason").trim();
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    const record = await findUser(targetUser.id);
    if (!record) {
      return interaction.editReply({ content: "❌ That user is not found in the regiment records." });
    }

    const currentCount = await getDemeritCount(targetUser.id);
    if (currentCount >= 3) {
      return interaction.editReply({ content: `❌ **${record.rowData[2]}** already has 3/3 demerits.` });
    }

    const newCount = await addDemerit(targetUser.id, reason, interaction.user.id);
    const username = (record.rowData[2] ?? targetUser.username).toString();

    const dmLines = [
      `⚠️ You have received demerit **${newCount}/3** for: *${reason}*`,
      `To contest this demerit, contact <@${interaction.user.id}>.`,
    ];
    if (newCount >= 3) {
      dmLines.push(`🔴 You have reached 3 demerits and have been moved to the Bavarian reserve.`);
    }
    await targetUser.send(dmLines.join("\n")).catch(() => null);

    if (newCount >= 3) {
      const rolesToRemove = [
        process.env.ROLE_REGIMENT,
        process.env.ROLE_PREMIER_CORPS,
        process.env.ROLE_GRANDE_ARMEE,
        process.env.ROLE_BAYREUTH,
        process.env.ROLE_ROSENHEIM,
      ].filter(Boolean);
      for (const roleId of rolesToRemove) {
        await targetMember.roles.remove(roleId).catch(err =>
          console.error(`Failed to remove role ${roleId}:`, err.message)
        );
      }

      const reserveRoles = (process.env.BAVARIAN_RESERVE_ROLES ?? "").split(",").map(r => r.trim()).filter(Boolean);
      for (const roleId of reserveRoles) {
        await targetMember.roles.add(roleId).catch(err =>
          console.error(`Failed to add role ${roleId}:`, err.message)
        );
      }
    }

    return interaction.editReply({
      content: `✅ Demerit issued to **${username}**.\n> **Demerits:** ${newCount}/3\n> **Reason:** ${reason}`,
    });
  },
};
