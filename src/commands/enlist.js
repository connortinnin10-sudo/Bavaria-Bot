const { SlashCommandBuilder } = require("discord.js");
const { enlistUser, findUser, parseUsername, findReserveUser, removeReserveUser } = require("../sheets");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user_enlist")
    .setDescription("Enlist a new recruit into the regiment")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The recruit to enlist").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("username").setDescription("Their Roblox username").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("company")
        .setDescription("Company assignment")
        .setRequired(true)
        .addChoices(
          { name: "Bayreuth",  value: "Bayreuth"  },
          { name: "Rosenheim", value: "Rosenheim" }
        )
    )
    .addStringOption((opt) =>
      opt.setName("timezone").setDescription("Recruit's timezone (e.g. EST, GMT+1)").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("rank")
        .setDescription("Starting rank")
        .setRequired(true)
        .addChoices(
          { name: "Soldat",             value: "Soldat"             },
          { name: "Soldat de Premier",  value: "Soldat de Premier"  },
          { name: "Caporal",            value: "Caporal"            },
          { name: "Caporal de Premier", value: "Caporal de Premier" },
          { name: "Caporal-Fourrier",   value: "Caporal-Fourrier"   }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const recruitmentRoleId = process.env.RECRUITMENT_ROLE_ID;

    // Role check (temporarily disabled for testing)
    // if (!interaction.member.roles.cache.has(recruitmentRoleId)) {
    //   return interaction.editReply("You do not have permission to use this command.");
    // }

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id);
    const displayName  = interaction.options.getString("username").trim();
    const company      = interaction.options.getString("company");
    const timezone     = interaction.options.getString("timezone");
    const rank         = interaction.options.getString("rank");

    // Check if already enlisted
    const existing = await findUser(targetUser.id);
    if (existing !== null) {
      return interaction.editReply({
        content: `${displayName} is already enlisted in the regiment.`,
      });
    }

    // If on reserve, remove them automatically before enlisting
    const onReserve = await findReserveUser(targetUser.id);
    if (onReserve) await removeReserveUser(targetUser.id);

    try {
      await enlistUser({
        userId:   targetUser.id,
        username: displayName,
        company,
        timezone,
        rank,
      });
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({
          content: `❌ No available rows in **${company}** company. Contact an administrator.`,
        });
      }
      throw err;
    }

    // Assign roles
    const rolesToAdd = [
      process.env.ROLE_REGIMENT,
      process.env.ROLE_PREMIER_CORPS,
      process.env.ROLE_GRANDE_ARMEE,
      company === "Bayreuth" ? process.env.ROLE_BAYREUTH : process.env.ROLE_ROSENHEIM,
    ].filter(Boolean);

    for (const roleId of rolesToAdd) {
      await targetMember.roles.add(roleId).catch((err) =>
        console.error(`Failed to add role ${roleId}:`, err.message)
      );
    }

    // Update nickname to [2.] (username)
    const newNickname = `[2.] ${displayName}`;
    await targetMember.setNickname(newNickname).catch((err) =>
      console.error("Failed to set nickname:", err.message)
    );

    return interaction.editReply({
      content: `✅ **${displayName}** has been enlisted.\n> **Company:** ${company}\n> **Timezone:** ${timezone}\n> **Rank:** ${rank}\n> **Nickname updated to:** ${newNickname}`,
    });
  },
};
