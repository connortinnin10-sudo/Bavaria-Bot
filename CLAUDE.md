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
- `src/permissions.js` — `hasAnyRole()` helper + `PROTECTED_ROLE_IDS` set
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
| `/user_enlist` | Enlist a fresh recruit — being redesigned (see below) |
| `/user_remove` | Remove from regiment, strip roles, restore guest role |
| `/user_reserve` | Move to reserve — being redesigned (see below) |
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

## Reserve system redesign (IN PROGRESS — not built yet)
This is the main thing being designed. The reserve sheet has two separate column blocks:

### Veteran Reserve (retired regiment members) — columns F, G, H, rows 15–234
- F: Discord ID
- G: Sheet username
- H: Rank (carried over from regiment sheet at time of reserve)

### Reserve Mercenary (never been in regiment) — columns Z, AA, AB, rows 15–234
- Z: Discord ID
- AA: Nickname
- AB: Rank (always hardcoded "Soldat")

### `/user_reserve` new logic
1. Check every company sheet to confirm user is not in the regiment
2. **If in regiment** → veteran reserve path: pull rank + username from sheet, remove from all company/department sheets, write to F/G/H columns. Rank locked at retired rank.
3. **If not in regiment** → mercenary path: write to Z/AA/AB columns, rank hardcoded Soldat. Rank permanently locked.

### `/user_enlist` new logic (replaces current command)
- No rank picker — bot determines rank automatically
- Bot checks reserve sheet first:
  - **Veteran reserve** (has data in F/G/H) → restores their saved rank + company automatically
  - **Mercenary reserve** (has data in Z/AA/AB) → enlists as Soldat, officer picks company (timezone already stored or provided)
  - **Not on reserve** → fresh recruit, officer picks company + provides timezone, enlists as Soldat
- Timezone and company become optional params; bot errors if fresh recruit omits them

### Rank locking
`/user_rank_change` must block if target user is found in either reserve section.

### Still to confirm before building
- What roles `/user_reserve` adds/removes for each reserve type
- Whether veteran reenlisting restores their old company or officer picks
- Whether mercenary reenlisting always uses officer-picked company

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

## Technical notes
- `interaction.member._roles` — raw role ID array from gateway, use this instead of `member.roles.cache` to avoid stale cache issues
- `interaction.member = freshMember` silently fails (non-writable). Patch via `interaction.member._roles = freshMember._roles`
- All permission checks were removed from commands pending role system verification
- Google Sheets GID for departments sheet: `1958342844`
