# BavariaBot — Project Context

## What this is
Discord.js v14 bot for the **2nd Bavarian Regiment** (Roblox/Napoleon-era regiment community). Hosted on **Railway**. Google Sheets is the database — no SQL. Bot manages enlistment, ranks, departments, demerits, LOA, and reserves via slash commands.

## Critical security rule
**NEVER share or output the Discord token.** All other credentials (role IDs, sheet IDs, API keys) can be shared in chat if needed.

## Railway env var issue — important
Railway does NOT read from the gitignored `.env` file. Any `process.env.*` that isn't explicitly set in the Railway dashboard resolves to `undefined` silently. The confirmed fix: **hardcode non-sensitive values (role IDs) directly in code** rather than reading from env vars. This has already been applied to DEPT_ROLES and PROTECTED_ROLE_IDS.

## Key files
- `index.js` — bot entry point, centralized `deferReply`, fresh member fetch before every command patches `interaction.member._roles` directly
- `src/sheets.js` — all Google Sheets read/write logic
- `src/permissions.js` — `hasAnyRole()` helper + `PROTECTED_ROLE_IDS` set + `PROTECTED_RANKS` set (Sergent and above)
- `src/commands/` — one file per command

## Protected roles (never removed from any user)
Hardcoded in `src/permissions.js`:
```
1193239194529714378  Verified
1420175239429623858  Merit Grade
1193239194571649051  Permissions
1193239194571649044  Designation
1239206838029783041  Departments
1193239194529714381  Awards
```

## Department role IDs (hardcoded in addDepartment.js + departmentRemove.js)
```
1224512938983952475  Recruitment Department
1224513613377568889  Propaganda Department
1193815658182492191  Flag Department
```

## Current commands (as of last session)
| Command | Description |
|---|---|
| `/user_enlist` | Enlist a recruit — rank auto-determined from reserve status (see below) |
| `/user_exile` | Permanently ban: remove from all sheets (incl. reserves), blacklist them (see below) |
| `/user_clear_exile` | Clear an exile so the member can be enlisted/targeted again |
| `/user_reserve` | Move to veteran/mercenary reserve, DMs the user (see below) |
| `/transfer_company` | Move an enlisted member's full roster row to the other company (see below) |
| `/user_rank_change` | Swap rank role on sheet and Discord |
| `/user_loa` | Place member on LOA |
| `/user_loa_remove` | Remove member from LOA |
| `/department_add` | Add to department + assign dept role |
| `/department_remove` | Remove from department + strip dept role |
| `/demerit_add` | Issue a demerit |
| `/demerit_remove` | Remove a demerit |
| `/demerit_remove_all` | Clear all demerits |
| `/recruit_add` | Add recruitment tally |
| `/recruit_remove` | Remove recruitment tally |
| `/recruit_clear_sheet` | Clear all tallies |
| `/my_stats` | View own regiment stats |

## Reserve system (rebuilt — matches live sheet)
The reserve sheet has two separate column blocks, both normalized in code to `[discordId, name, rank]` via `RESERVE_BLOCKS` in `src/sheets.js`:

### Veteran Reserve (retired regiment members) — columns F, G, H, rows 15–234
- F: Discord ID
- G: Name
- H: Former Rank (carried over from the company sheet at time of reserve, locked)

### Reserve Mercenary (never been in regiment) — columns Z, AA, AB, rows 15–234
- Z: Discord ID
- AA: Name
- AB: Rank (always hardcoded "Soldat")

Both blocks are followed by read-only stat/attendance columns (kills, activity %, weekly checkboxes) that reserve code must never touch.

### `/user_reserve` (no `timezone` option — dropped, reserve blocks have no timezone slot)
1. Block if the target is already on either reserve block.
2. If currently enlisted (found via `findUser`) → **veteran** path: capture their current rank + username, remove from company/department sheets, write to F/G/H with that rank locked.
3. If not currently enlisted → **mercenary** path: write to Z/AA/AB with rank hardcoded `"Soldat"`.
4. DMs the target: `"You were moved to reserves by @{officer}."` (`.catch(() => null)` — never blocks the command if DMs are closed). **TODO (future):** expand this DM once more detail is available — kept intentionally minimal for now.
5. **TODO (future work, required — not abandoned):** role add/remove per reserve type is still unbuilt. `RESERVE_ROLES_REMOVE`/`RESERVE_ROLES_ADD` env vars don't exist anywhere, so that block in `userReserve.js` is currently a no-op.

### `/user_enlist` (no `rank` option — rank is bot-determined)
- `company` and `timezone` stay required, officer-supplied, **never auto-restored** — even for veterans, the officer picks company fresh each time.
- Rank resolution via `findReserveUser`:
  - **Veteran reserve found** → restores their locked rank, clears the reserve record.
  - **Mercenary reserve found** → enlists as `"Soldat"`, clears the reserve record.
  - **No reserve record at all** → true fresh recruit → enlists as `"Conscript"` (lowest tier, below Soldat).
- No DM on enlist in this build — planned for later, explicitly deferred.

### Rank locking
`/user_rank_change` blocks with a clear message if the target is found on either reserve block (checked before the existing `PROTECTED_RANKS` officer-rank check).

## Company transfer
`/transfer_company` moves a currently-enlisted member from their current company sheet to the first open row on the other one (`transferCompany()` in `sheets.js`). It moves two non-contiguous ranges only:
- `G:K` (`ROSTER_CORE_*` constants) — rank, timezone, name, LOA checkbox, Discord ID. Real data.
- `O:AB` (`ROSTER_ATTENDANCE_*` constants) — the cycle's 14 weekly attendance checkboxes. Real toggle data.

**`L:N` (Kills, KPE, Activity%) are never read or written.** Kills/KPE are looked up off the Name (I) and Activity% is computed off the weekly checkboxes, so writing static values there would conflict with/overwrite that logic — they recalculate on their own once the name and checkboxes land in the new row. `AD` onward is a computed kill/KPE leaderboard, also never touched.

The source ranges are read padded to full width before writing so they fully overwrite (rather than leave stale) whatever was already in the destination row — `removeUser`/`clearRow` only ever clears `G:K`, so old kills/attendance data can otherwise linger in a nominally "available" row. The old row's `G:K` and `O:AB` are both cleared after the copy; `L:N` on the old row is deliberately left alone. The command also swaps `ROLE_BAYREUTH`/`ROLE_ROSENHEIM` on Discord to match. No DM is sent on transfer (not requested).

## Exile system
`/user_exile` (formerly `/user_remove`, renamed) is a permanent ban: it removes the member from the enlist sheet AND either reserve block (whichever they're found on), clears departments/accountability, strips roles, then appends `[Discord ID, Username, Former Rank]` to the **"Blacklisted"** tab (GID `2111784594`, no header row — same append/clear convention as the Demerits tab).

Enforcement is centralized in `index.js`, not per-command: right after the fresh-member-fetch patch and before `command.execute()`, it calls `isExiled()` on whatever the interaction's `user` option resolves to. If that user is blacklisted, the command is blocked with a generic message — this covers every current and future command that takes a `user` option, with no per-command changes needed. The only exemption is `/user_clear_exile` itself (`EXILE_CHECK_EXEMPT` set in `index.js`), so it can target an exiled user to clear them via `clearExile()`.

Because command registration changed (`user_remove` → `user_exile`, plus new `user_clear_exile`), `npm run deploy` (`src/deploy-commands.js`) must be re-run against Discord's API for the new/renamed slash commands to actually appear — a `git push` alone only updates the running bot process, not Discord's registered command list.

## Discord role IDs (from .env)
```
ROLE_REGIMENT=1193239194529714382
ROLE_PREMIER_CORPS=1193239194529714385
ROLE_GRANDE_ARMEE=1193239194529714386
ROLE_BAYREUTH=1193814561401344010
ROLE_ROSENHEIM=1506735371353063555
GUEST_ROLE=1193239194529714380
VERIFIED_ROLE_ID=1193239194529714378
RANK_ROLE_CONSCRIPT=1193239194571649053
RANK_ROLE_SOLDAT=1193239194600996994
RANK_ROLE_SOLDAT_DE_PREMIER=1193239194600996995
RANK_ROLE_CAPORAL=1193239194600996997
RANK_ROLE_CAPORAL_DE_PREMIER=1193239194600996998
RANK_ROLE_CAPORAL_FOURRIER=1193239194600996999
ROLE_RECRUITMENT=1224512938983952475
ROLE_PETIT_ETAT_MAJOR=1197983145060990996
ROLE_ETAT_MAJOR=1193239194571649045
ROLE_DEPARTMENT_HEAD=1312900709888426075
DEPT_GID=1958342844
DISCORD_GUILD_ID=1193239194395476008
```

## Command logging
Every slash command invocation is logged to a Discord webhook, styled like the DM embeds (crest thumbnail, `BAVARIAN_BLUE` accent). `src/commandLog.js` exports `logCommand({ commandName, officerId, targetUser, reason })`, called centrally from `index.js` right after `await command.execute(interaction)` succeeds — no per-command changes needed for new commands to get logged automatically. Only commands that actually ran are logged (permission-denied / exile-blocked short-circuits never reach this point). Sends via `WebhookClient` using the `LOG_WEBHOOK_URL` env var; if that var is unset, `logCommand` no-ops with a console warning rather than throwing — **remember to set `LOG_WEBHOOK_URL` in the Railway dashboard**, not just `.env`, or logging silently does nothing in production (the same Railway env var pitfall noted above).

## Webhooks (there are two — do not confuse them)
The bot posts to two **separate** Discord webhooks, each with its own env var and module. Both must be set in the **Railway dashboard** (not just `.env`) or they silently no-op in production:

| Purpose | Env var | Module | Fires when |
|---|---|---|---|
| **Admin command log** (officer audit trail) | `LOG_WEBHOOK_URL` | `src/commandLog.js` → `logCommand()` | after every successful slash command, centrally from `index.js` |
| **Company transfer welcome** (per company) | `ROSENHEIM_WEBHOOK_URL`, `BAYREUTH_WEBHOOK_URL` | `src/welcomeLog.js` → `sendCompanyWelcome({ company, userId })` | anyone lands in that company — `/transfer_company` into it, or a veteran auto-balanced into it via `/user_enlist` |
| **Regiment enlistment log** | `ENLISTMENT_WEBHOOK_URL` | `src/welcomeLog.js` → `sendEnlistmentLog({ userId })` | every `/user_enlist` (both the Donauwörth induction path and the veteran re-enlist path) |

`sendCompanyWelcome` is company-generic: add `GRENADIER_WEBHOOK_URL` to the `COMPANY_WEBHOOK_URLS` map + set the var to enable Grenadier, no other change. Never hardcode a webhook URL in committed code — it's a credential; read from env (pushing a hardcoded URL gets blocked as a committed secret).

## Technical notes
- `interaction.member._roles` — raw role ID array from gateway, use this instead of `member.roles.cache` to avoid stale cache issues
- `interaction.member = freshMember` silently fails (non-writable). Patch via `interaction.member._roles = freshMember._roles`
- All permission checks were removed from commands pending role system verification
- Google Sheets GID for departments sheet: `1958342844`
