const { SlashCommandBuilder } = require("discord.js");
const { transferCompany, getCompanyStaff } = require("../sheets");
const { buildTransferEmbed, buildVeteranWelcomeBackEmbed } = require("../welcomeEmbed");
const { sendCompanyWelcome } = require("../welcomeLog");
const { COMPANY_ROLES, ROLE_DONAUWORTH } = require("../permissions");

const RANK_ROLES = {
  "Conscript":          process.env.RANK_ROLE_CONSCRIPT,
  "Soldat":             process.env.RANK_ROLE_SOLDAT,
  "Soldat de Premier":  process.env.RANK_ROLE_SOLDAT_DE_PREMIER,
  "Caporal":            process.env.RANK_ROLE_CAPORAL,
  "Caporal de Premier": process.env.RANK_ROLE_CAPORAL_DE_PREMIER,
  "Caporal-Fourrier":   process.env.RANK_ROLE_CAPORAL_FOURRIER,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("transfer_company")
    .setDescription("Move a member to a company: graduate a Donauwörth trainee or return a veteran from reserve")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The member to transfer").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("company")
        .setDescription("Destination company")
        .setRequired(true)
        .addChoices(
          { name: "Bayreuth",  value: "Bayreuth"  },
          { name: "Rosenheim", value: "Rosenheim" },
          { name: "Grenadier", value: "Grenadier" }
        )
    )
    .addStringOption((opt) =>
      opt.setName("timezone").setDescription("Timezone — only used when returning a veteran from reserve").setRequired(false)
    ),

  async execute(interaction) {

    const targetUser   = interaction.options.getUser("user");
    if (targetUser.bot) return interaction.editReply({ content: "This command cannot be used on bots." });
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
      return interaction.editReply({ content: "Could not find that member in this server." });
    }

    const destination = interaction.options.getString("company");
    const timezone    = interaction.options.getString("timezone");

    let result;
    try {
      result = await transferCompany(targetUser.id, destination, timezone);
    } catch (err) {
      if (err.message === "NO_SPACE") {
        return interaction.editReply({ content: `❌ No available rows in **${destination}**. Contact an administrator.` });
      }
      if (err.message === "SAME_COMPANY") {
        return interaction.editReply({ content: `**${targetUser.username}** is already in **${destination}**.` });
      }
      if (err.message === "MERCENARY_RESERVE") {
        return interaction.editReply({ content: `**${targetUser.username}** is a mercenary on reserve — enlist them with \`/user_enlist\` (they start at Conscript in Donauwörth).` });
      }
      throw err;
    }

    if (!result) {
      return interaction.editReply({
        content: `**${targetUser.username}** was not found in the regiment records.`,
      });
    }

    const { source, fromCompany, toCompany, username, rank } = result;
    const isDonauworth   = source === "donauworth";
    const isVeteranReturn = source === "veteran-reserve";

    // Company role swap. Sources without a company role (Donauwörth, reserve) have
    // no old role to strip. COMPANY_ROLES has entries for all three companies.
    const OLD_ROLE = COMPANY_ROLES[fromCompany];
    const NEW_ROLE = COMPANY_ROLES[toCompany];

    if (OLD_ROLE) {
      await targetMember.roles.remove(OLD_ROLE).catch((err) =>
        console.error("Failed to remove old company role:", err.message)
      );
    }
    if (NEW_ROLE) {
      await targetMember.roles.add(NEW_ROLE).catch((err) =>
        console.error("Failed to add new company role:", err.message)
      );
    }

    // Donauwörth graduates are promoted Conscript -> Soldat and lose the induction role.
    if (isDonauworth) {
      await targetMember.roles.remove(process.env.RANK_ROLE_CONSCRIPT).catch((err) =>
        console.error("Failed to remove Conscript role:", err.message)
      );
      await targetMember.roles.add(process.env.RANK_ROLE_SOLDAT).catch((err) =>
        console.error("Failed to add Soldat role:", err.message)
      );
      await targetMember.roles.remove(ROLE_DONAUWORTH).catch((err) =>
        console.error("Failed to remove Donauwörth role:", err.message)
      );
    }

    // Returning veterans get their rank role + core regiment roles restored, and
    // the [2.] nickname prefix back.
    if (isVeteranReturn) {
      const rankRole = RANK_ROLES[rank];
      if (rankRole) {
        await targetMember.roles.add(rankRole).catch((err) =>
          console.error("Failed to add rank role:", err.message)
        );
      }
      for (const roleId of [process.env.ROLE_REGIMENT, process.env.ROLE_PREMIER_CORPS, process.env.ROLE_GRANDE_ARMEE].filter(Boolean)) {
        await targetMember.roles.add(roleId).catch((err) =>
          console.error(`Failed to add role ${roleId}:`, err.message)
        );
      }
      await targetMember.setNickname(`[2.] ${username}`).catch((err) =>
        console.error("Failed to set nickname:", err.message)
      );
    }

    // DM the member. Returning veterans get the "welcome back" embed; everyone else
    // gets the standard transfer embed.
    const staff = await getCompanyStaff(toCompany);
    const { embed, files } = isVeteranReturn
      ? buildVeteranWelcomeBackEmbed({ userId: targetUser.id, rank, company: toCompany, staff })
      : buildTransferEmbed({ userId: targetUser.id, company: toCompany, staff });
    await targetUser.send({ embeds: [embed], files }).catch(() => null);

    // Announce the new arrival to their company's welcome webhook (no-op if that
    // company has none configured).
    await sendCompanyWelcome({ company: toCompany, userId: targetUser.id });

    const note = isDonauworth
      ? "\n> Graduated from Donauwörth induction — promoted to **Soldat**."
      : isVeteranReturn
        ? "\n> Returned from the veteran reserve at their retained rank."
        : "\n> Attendance history carried over. Kills, KPE, and activity% will recalculate automatically.";

    return interaction.editReply({
      content: `✅ **${username || targetUser.username}** has been transferred from **${fromCompany}** to **${toCompany}**.\n> **Rank:** ${rank || "Unknown"}${note}`,
    });
  },
};
