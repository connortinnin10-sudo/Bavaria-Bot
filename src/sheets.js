const { google } = require("googleapis");
const crypto = require("crypto");
require("dotenv").config();
const { nextRank, pointsForNextRank } = require("./permissions");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const ENLIST_READ_START  = 15; // read from row 15 (includes all command/officer rows)
const ENLIST_START_ROW   = 23; // write only from row 23
const ENLIST_END_ROW     = 68; // default roster end row

// Per-company roster end-row overrides. Bayreuth's placement area was expanded to
// row 170 (same layout, just more rows); the other companies still end at 68.
// Add a company here to grow its roster — no other change needed.
const ENLIST_END_ROW_OVERRIDES = { Bayreuth: 170 };
function enlistEndRow(company) {
  return ENLIST_END_ROW_OVERRIDES[company] ?? ENLIST_END_ROW;
}

// Per-member roster row layout: G:K are real data (rank, timezone, name, LOA,
// discord ID). L=Kills and M=KPE are looked up off the Name (I); N=Activity% is
// computed off the weekly checkboxes. Those three (L:N) are formula-driven and
// must never be read/written as static values. O:AB are the cycle's 14 weekly
// attendance checkboxes (real toggle data). AC onward is a computed leaderboard.
const ROSTER_CORE_START_COL       = "G";
const ROSTER_CORE_END_COL         = "K";
const ROSTER_CORE_WIDTH           = 5;
const ROSTER_ATTENDANCE_START_COL = "O";
const ROSTER_ATTENDANCE_END_COL   = "AB";
const ROSTER_ATTENDANCE_WIDTH     = 14;

const COL = {
  RANK:     { letter: "G", idx: 0 },
  TIMEZONE: { letter: "H", idx: 1 },
  NAME:     { letter: "I", idx: 2 },
  // J (idx 3) is unused/skipped
  DISCORD:  { letter: "K", idx: 4 },
  KILLS:    { letter: "L", idx: 5 },
  KPE:      { letter: "M", idx: 6 },
  ACTIVITY: { letter: "N", idx: 7 },
};

const COMPANY_GID = {
  Bayreuth:  261215654,
  Rosenheim: 1875189602,
  Grenadier: 161563671,
};

// Donauworth is the induction/trial holding sheet — fresh recruits and
// re-enlisting mercenaries land here as Conscript before graduating to a
// company via transferCompany(). Different layout than a company roster:
// no LOA checkbox, Discord ID sits at J instead of K, and K/L (attended
// induction, transfer status) are dropdowns the bot never writes to.
const DONAUWORTH_GID       = 1702557097;
const DONAUWORTH_START_ROW = 27;
const DONAUWORTH_END_ROW   = 90;

const DONAUWORTH_COL = {
  RANK:     { letter: "G", idx: 0 },
  TIMEZONE: { letter: "H", idx: 1 },
  NAME:     { letter: "I", idx: 2 },
  DISCORD:  { letter: "J", idx: 3 },
};

// Company staff block (Kompaniestab): C=Rank, D=Name, rows 21-26.
// Position is implied by row index, not read from a column.
const STAFF_ROWS = [
  { row: 21, position: "Kommandant" },
  { row: 22, position: "Unterkommandant" },
  { row: 23, position: "Unteroffizier" },
  { row: 24, position: "Unteroffizier" },
  { row: 25, position: "Unteroffizier" },
  { row: 26, position: "Unteroffizier" },
];
const STAFF_RANGE = "C21:D26";

// Specialist positions recorded on the company sheet itself, in slots separate
// from the roster. Matched by name only (no Discord ID is stored in these cells).
// Sapper/Drummer share the C(rank)/D(name) columns on fixed row pairs; Schützen
// sit in AN(rank)/AO(name) across a range. Only Bayreuth/Rosenheim for now.
const SPECIALIZATION_BLOCKS = {
  Sapper:     { rows: [31, 32],             rankCol: "C",  nameCol: "D"  },
  Drummer:    { rows: [33, 34],             rankCol: "C",  nameCol: "D"  },
  "Schützen": { startRow: 15, endRow: 47,   rankCol: "AN", nameCol: "AO" },
};

// The full list of row numbers a specialization block occupies.
function specializationRows(block) {
  if (block.rows) return block.rows;
  const rows = [];
  for (let r = block.startRow; r <= block.endRow; r++) rows.push(r);
  return rows;
}

const DEPT_GID        = parseInt(process.env.DEPT_GID, 10);
const RESERVE_GID     = 226567638;
const RESERVE_START   = 15;
const RESERVE_END     = 234;

// Both blocks normalize to [discordId, name, rank]
const RESERVE_BLOCKS = {
  veteran:   { colStart: "F", colEnd: "H" },  // F=Discord ID, G=Name, H=Former Rank
  mercenary: { colStart: "Z", colEnd: "AB" }, // Z=Discord ID, AA=Name, AB=Rank
};

// Department config: rows, columns, capacity
const DEPARTMENTS = {
  "Recruitment Department": {
    startRow: 18, endRow: 30,
    rankCol: "C", nameCol: "D", tallyCol: "E",
    rankIdx: 0,   nameIdx: 1,
    fetchRange: (s, e) => `C${s}:D${e}`,
  },
  "Propaganda Department": {
    startRow: 18, endRow: 27,
    rankCol: "H", nameCol: "I",
    rankIdx: 0,   nameIdx: 1,
    fetchRange: (s, e) => `H${s}:I${e}`,
  },
  "Flag Department": {
    startRow: 18, endRow: 48,
    positionCol: "K", rankCol: "L", nameCol: "M",
    rankIdx: 0,       nameIdx: 1,
    fetchRange: (s, e) => `L${s}:M${e}`,
    sections: () => FLAG_SECTIONS,
  },
};

// Flag members sit in per-company sections rather than one flat list. The
// Kommandant rows (16 Department, 17/18 Bayreuth, 33 Volts, 41 München) hold
// permanent slot labels in column K and fall outside every section — the bot must
// never write to or clear them. The middle section is labelled "Volts" on the
// sheet but keyed by the company system's name "Rosenheim".
const FLAG_SECTIONS = {
  Bayreuth:  { startRow: 19, endRow: 32 },
  Rosenheim: { startRow: 34, endRow: 40 }, // "Volts" section on the sheet
  Grenadier: { startRow: 42, endRow: 48 }, // München section
};

// Row numbers the bot manages for a department: the flat startRow..endRow range,
// or — for Flag — only the per-company section rows, skipping Kommandant slots.
function deptMemberRows(dept) {
  const rows = [];
  if (dept.sections) {
    for (const { startRow, endRow } of Object.values(dept.sections())) {
      for (let r = startRow; r <= endRow; r++) rows.push(r);
    }
    return rows;
  }
  for (let r = dept.startRow; r <= dept.endRow; r++) rows.push(r);
  return rows;
}

// The span a member occupies on one row. Starts at the position column where the
// department has one (Flag's K), so a cleared row leaves no stale position behind
// for the next occupant to inherit.
function deptClearRange(dept, rowNumber) {
  const startCol = dept.positionCol ?? dept.rankCol;
  const endCol   = dept.tallyCol ?? dept.nameCol;
  return `${startCol}${rowNumber}:${endCol}${rowNumber}`;
}

let tabNameCache = null;
let _auth        = null;

// Railway sometimes strips newlines from env vars, leaving the PEM as one long line.
// This re-wraps the base64 body at 64 chars so OpenSSL can parse it. Also strips stray
// backslashes, not just whitespace — a double-escaped key (\\n instead of \n) leaves a
// literal backslash embedded in the body after one round of \n-unescaping, which
// corrupts the base64 and fails with "DECODER routines::unsupported" otherwise.
function normalizePrivateKey(raw) {
  const pem = (raw || "").replace(/\\n/g, "\n");
  const m   = pem.match(/(-+BEGIN PRIVATE KEY-+)([\s\S]*?)(-+END PRIVATE KEY-+)/);
  if (!m) return pem;
  const body = m[2].replace(/[\s\\]+/g, "").match(/.{1,64}/g)?.join("\n") ?? "";
  return `${m[1]}\n${body}\n${m[3]}\n`;
}

function getAuth() {
  if (!_auth) {
    _auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key:  normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  return _auth;
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

async function getTabNames() {
  if (tabNameCache) return tabNameCache;
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const cache = {};
  for (const s of meta.data.sheets) {
    cache[s.properties.sheetId] = {
      name:    s.properties.title,
      sheetId: s.properties.sheetId,
    };
  }
  tabNameCache = cache;
  return cache;
}


// Strip [2.], ignore anything in quotes, ignore anything after a comma
// Only the core Roblox username remains
function parseUsername(rawNickname) {
  let name = (rawNickname ?? "").toString();
  name = name.replace(/^\[2\.\]\s*/i, "");   // strip [2.] prefix
  name = name.split(",")[0];                   // take only before first comma
  name = name.replace(/"[^"]*"/g, "");         // remove anything in quotes
  return name.trim();
}

async function fetchEnlistRows(tabName, startRow = ENLIST_READ_START, endRow = ENLIST_END_ROW) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!G${startRow}:N${endRow}`,
  });
  return res.data.values ?? [];
}

// Donauworth uses its own row range and a G:L read window (Discord ID at J,
// dropdowns at K/L) rather than the company G:N layout.
async function fetchDonauworthRows(tabName, startRow = DONAUWORTH_START_ROW) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!G${startRow}:L${DONAUWORTH_END_ROW}`,
  });
  return res.data.values ?? [];
}

// A row is available if column G (rank, idx 0) is empty
function isEnlistRowAvailable(row) {
  return (row[0] ?? "").toString().trim() === "";
}

function isDeptRowAvailable(row) {
  return [0, 1].every((i) => (row[i] ?? "").toString().trim() === "");
}

async function writeRow(tabName, startCol, endCol, rowNumber, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!${startCol}${rowNumber}:${endCol}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

async function clearRow(tabName, rowNumber) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!G${rowNumber}:K${rowNumber}`,
  });
}

// Search the company tabs and the Donauworth induction tab for a Discord user ID.
// Both layouts keep rank at idx 0 and name at idx 2, so callers reading
// rowData[0]/rowData[2] work regardless of which sheet the row came from.
async function findUser(userId) {
  const tabNames = await getTabNames();
  for (const [company, gid] of Object.entries(COMPANY_GID)) {
    const info = tabNames[gid];
    if (!info) continue;
    const rows = await fetchEnlistRows(info.name, ENLIST_READ_START, enlistEndRow(company));
    for (let i = 0; i < rows.length; i++) {
      const discordId = (rows[i][COL.DISCORD.idx] ?? "").toString().trim();
      if (discordId === userId) {
        return {
          tabName:   info.name,
          sheetId:   info.sheetId,
          rowNumber: ENLIST_READ_START + i,
          rowData:   rows[i],
          company,
        };
      }
    }
  }

  // Donauworth induction tab (Discord ID at column J / idx 3)
  const dInfo = tabNames[DONAUWORTH_GID];
  if (dInfo) {
    const rows = await fetchDonauworthRows(dInfo.name, DONAUWORTH_START_ROW);
    for (let i = 0; i < rows.length; i++) {
      const discordId = (rows[i][DONAUWORTH_COL.DISCORD.idx] ?? "").toString().trim();
      if (discordId === userId) {
        return {
          tabName:   dInfo.name,
          sheetId:   dInfo.sheetId,
          rowNumber: DONAUWORTH_START_ROW + i,
          rowData:   rows[i],
          company:   "Donauworth",
        };
      }
    }
  }
  return null;
}

async function enlistUser({ userId, username, company, timezone, rank }) {
  const tabNames = await getTabNames();
  const gid      = COMPANY_GID[company];
  const info     = tabNames[gid];
  if (!info) throw new Error(`No tab found for company: ${company}`);

  const endRow = enlistEndRow(company);
  const rows = await fetchEnlistRows(info.name, ENLIST_START_ROW, endRow);

  // Loop over the full declared range, not rows.length — the Sheets API omits
  // trailing rows entirely when they're fully blank, so if the only open slot
  // is at the tail end, rows.length comes back short and a rows.length-bounded
  // loop would never reach it, wrongly reporting NO_SPACE.
  let targetRowNumber = null;
  for (let i = 0; i < (endRow - ENLIST_START_ROW + 1); i++) {
    if (isEnlistRowAvailable(rows[i] ?? [])) {
      targetRowNumber = ENLIST_START_ROW + i;
      break;
    }
  }
  if (targetRowNumber === null) throw new Error("NO_SPACE");

  // G=rank, H=timezone, I=name, J=checkbox(LOA), K=discordId
  await writeRow(info.name, "G", "K", targetRowNumber, [rank, timezone, username, false, "'" + userId]);

  // Insert checkbox validation on column J so the LOA toggle works
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        setDataValidation: {
          range: {
            sheetId:          info.sheetId,
            startRowIndex:    targetRowNumber - 1,
            endRowIndex:      targetRowNumber,
            startColumnIndex: 9, // column J
            endColumnIndex:   10,
          },
          rule: { condition: { type: "BOOLEAN" }, strict: true },
        },
      }],
    },
  });
}

// Writes a fresh recruit / re-enlisting mercenary into the Donauworth induction
// tab as a Conscript. Layout differs from a company roster: G=rank, H=timezone,
// I=name, J=Discord ID (no LOA checkbox), and K/L dropdowns are left untouched.
async function enlistToDonauworth({ userId, username, timezone }) {
  const tabNames = await getTabNames();
  const info     = tabNames[DONAUWORTH_GID];
  if (!info) throw new Error("No tab found for Donauworth");

  const rows = await fetchDonauworthRows(info.name, DONAUWORTH_START_ROW);

  // Loop the full declared range, not rows.length — the Sheets API drops
  // trailing blank rows, same reasoning as enlistUser.
  let targetRowNumber = null;
  for (let i = 0; i < (DONAUWORTH_END_ROW - DONAUWORTH_START_ROW + 1); i++) {
    if (isEnlistRowAvailable(rows[i] ?? [])) {
      targetRowNumber = DONAUWORTH_START_ROW + i;
      break;
    }
  }
  if (targetRowNumber === null) throw new Error("NO_SPACE");

  // G=rank, H=timezone, I=name, J=discordId — no checkbox validation needed.
  await writeRow(info.name, "G", "J", targetRowNumber, ["Conscript", timezone, username, "'" + userId]);
  return { tabName: info.name, rowNumber: targetRowNumber };
}

// Returns a veteran from the reserve into a company at their retained (already
// capped) rank. The reserve block stores no timezone, so it's passed in (blank if
// the officer didn't supply one). Attendance starts clean; the reserve entry is
// cleared once they're placed.
async function returnVeteranToCompany(userId, company, timezone, reserve) {
  const tabNames = await getTabNames();
  const info     = tabNames[COMPANY_GID[company]];
  if (!info) throw new Error(`No tab found for company: ${company}`);

  const rank     = (reserve.rowData[2] ?? "").toString().trim() || "Soldat";
  const username = (reserve.rowData[1] ?? "").toString().trim();

  const endRow = enlistEndRow(company);
  const rows = await fetchEnlistRows(info.name, ENLIST_START_ROW, endRow);
  let targetRowNumber = null;
  for (let i = 0; i < (endRow - ENLIST_START_ROW + 1); i++) {
    if (isEnlistRowAvailable(rows[i] ?? [])) { targetRowNumber = ENLIST_START_ROW + i; break; }
  }
  if (targetRowNumber === null) throw new Error("NO_SPACE");

  // G:K = rank, timezone, name, LOA(false), discordId. Attendance O:AB blank.
  await writeRow(info.name, ROSTER_CORE_START_COL, ROSTER_CORE_END_COL, targetRowNumber,
    [rank, timezone ?? "", username, false, "'" + userId]);
  await writeRow(info.name, ROSTER_ATTENDANCE_START_COL, ROSTER_ATTENDANCE_END_COL, targetRowNumber,
    Array.from({ length: ROSTER_ATTENDANCE_WIDTH }, () => ""));

  // Re-apply the LOA checkbox validation on column J, same as enlistUser.
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        setDataValidation: {
          range: { sheetId: info.sheetId, startRowIndex: targetRowNumber - 1, endRowIndex: targetRowNumber, startColumnIndex: 9, endColumnIndex: 10 },
          rule: { condition: { type: "BOOLEAN" }, strict: true },
        },
      }],
    },
  });

  await removeReserveUser(userId);
  return { source: "veteran-reserve", fromCompany: "Veteran Reserve", toCompany: company, rank, username };
}

// Moves a member's core fields (rank, timezone, name, LOA, Discord ID) and weekly
// attendance checkboxes to the first open row on the chosen destination company's
// sheet, then clears the old row. Kills/KPE/Activity% (L:N) are intentionally
// never touched — Kills and KPE are looked up off the Name, and Activity% is
// computed off the checkboxes, so they recalculate on their own once the name
// and checkboxes land in the new row.
//
// Source paths:
//  - Veteran reserve: pulled off the reserve back into the chosen company at their
//    retained rank (handled by returnVeteranToCompany). Mercenary reserve is rejected.
//  - Donauworth (trial graduation): source layout is G:J, no attendance history
//    exists yet, and the member is promoted to Soldat on the way out.
//  - Company → company: rank/timezone/LOA/attendance carried over unchanged.
async function transferCompany(userId, destinationCompany, timezone) {
  const found = await findUser(userId);
  if (!found) {
    // Not on a company/Donauworth roster — check the reserve block.
    const reserve = await findReserveUser(userId);
    if (!reserve) return null;                                 // truly not in the system
    if (reserve.type === "mercenary") throw new Error("MERCENARY_RESERVE");
    if (!COMPANY_GID[destinationCompany]) throw new Error(`No tab found for company: ${destinationCompany}`);
    return await returnVeteranToCompany(userId, destinationCompany, timezone, reserve);
  }

  const targetCompany = destinationCompany;
  if (!COMPANY_GID[targetCompany]) throw new Error(`No tab found for company: ${targetCompany}`);
  if (found.company === targetCompany) throw new Error("SAME_COMPANY");

  const tabNames  = await getTabNames();
  const targetInfo = tabNames[COMPANY_GID[targetCompany]];
  if (!targetInfo) throw new Error(`No tab found for company: ${targetCompany}`);

  const sheets = getSheetsClient();
  const fromDonauworth = found.company === "Donauworth";

  let paddedCore, paddedAttendance;
  if (fromDonauworth) {
    // Donauworth row is G:J (rank, timezone, name, Discord ID). Promote to Soldat,
    // re-prefix the Discord ID with ' to keep it text, default LOA false, and start
    // with a clean attendance slate (no history to carry).
    const timezone  = (found.rowData[DONAUWORTH_COL.TIMEZONE.idx] ?? "").toString().trim();
    const name      = (found.rowData[DONAUWORTH_COL.NAME.idx] ?? "").toString().trim();
    const discordId = (found.rowData[DONAUWORTH_COL.DISCORD.idx] ?? "").toString().trim();
    paddedCore       = ["Soldat", timezone, name, false, "'" + discordId];
    paddedAttendance = Array.from({ length: ROSTER_ATTENDANCE_WIDTH }, () => "");
  } else {
    const [coreRes, attendanceRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${found.tabName}!${ROSTER_CORE_START_COL}${found.rowNumber}:${ROSTER_CORE_END_COL}${found.rowNumber}`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${found.tabName}!${ROSTER_ATTENDANCE_START_COL}${found.rowNumber}:${ROSTER_ATTENDANCE_END_COL}${found.rowNumber}`,
      }),
    ]);
    // Pad to full width so trailing blank cells overwrite any stale data already
    // sitting in the destination row (removeUser only clears G:K, not the rest).
    const coreRow       = coreRes.data.values?.[0] ?? [];
    const attendanceRow = attendanceRes.data.values?.[0] ?? [];
    paddedCore       = Array.from({ length: ROSTER_CORE_WIDTH },       (_, i) => coreRow[i] ?? "");
    paddedAttendance = Array.from({ length: ROSTER_ATTENDANCE_WIDTH }, (_, i) => attendanceRow[i] ?? "");
  }

  // Find the first open row on the target company (same rule as enlistUser).
  // Loop over the full declared range, not targetRows.length — see the same
  // comment in enlistUser for why a rows.length-bounded loop misses a trailing
  // open slot when the Sheets API drops fully-blank trailing rows.
  const targetEndRow = enlistEndRow(targetCompany);
  const targetRows = await fetchEnlistRows(targetInfo.name, ENLIST_START_ROW, targetEndRow);
  let targetRowNumber = null;
  for (let i = 0; i < (targetEndRow - ENLIST_START_ROW + 1); i++) {
    if (isEnlistRowAvailable(targetRows[i] ?? [])) {
      targetRowNumber = ENLIST_START_ROW + i;
      break;
    }
  }
  if (targetRowNumber === null) throw new Error("NO_SPACE");

  // If the member holds a Flag Department slot, move it to the destination company's
  // flag section BEFORE writing the roster — so a full flag section (FLAG_SECTION_FULL)
  // aborts the whole transfer cleanly, with no roster rows written yet.
  const flagMove = await moveFlagDepartmentToCompany(
    (paddedCore[COL.NAME.idx] ?? "").toString().trim(),
    targetCompany,
  );

  await writeRow(targetInfo.name, ROSTER_CORE_START_COL, ROSTER_CORE_END_COL, targetRowNumber, paddedCore);
  await writeRow(targetInfo.name, ROSTER_ATTENDANCE_START_COL, ROSTER_ATTENDANCE_END_COL, targetRowNumber, paddedAttendance);

  // Re-apply checkbox validation on column J (LOA), same as enlistUser
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        setDataValidation: {
          range: {
            sheetId:          targetInfo.sheetId,
            startRowIndex:    targetRowNumber - 1,
            endRowIndex:      targetRowNumber,
            startColumnIndex: 9, // column J
            endColumnIndex:   10,
          },
          rule: { condition: { type: "BOOLEAN" }, strict: true },
        },
      }],
    },
  });

  // Clear the old row. Donauworth only ever has G:J (K/L are officer dropdowns);
  // a company row clears core G:K plus attendance O:AB, leaving L:N untouched.
  if (fromDonauworth) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${found.tabName}!G${found.rowNumber}:J${found.rowNumber}`,
    });
  } else {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${found.tabName}!${ROSTER_CORE_START_COL}${found.rowNumber}:${ROSTER_CORE_END_COL}${found.rowNumber}`,
    });
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${found.tabName}!${ROSTER_ATTENDANCE_START_COL}${found.rowNumber}:${ROSTER_ATTENDANCE_END_COL}${found.rowNumber}`,
    });
  }

  return {
    source:      fromDonauworth ? "donauworth" : "company",
    fromCompany: found.company,
    toCompany:   targetCompany,
    rank:        (paddedCore[COL.RANK.idx] ?? "").toString().trim(),
    username:    (paddedCore[COL.NAME.idx] ?? "").toString().trim(),
    flagMoved:   flagMove.moved,
  };
}

// Reads the Kompaniestab block (rows 21-26) for a company and cross-references
// each name against the roster to resolve a Discord ID for tagging.
async function getCompanyStaff(company) {
  const tabNames = await getTabNames();
  const gid      = COMPANY_GID[company];
  const info     = tabNames[gid];
  if (!info) throw new Error(`No tab found for company: ${company}`);

  const sheets = getSheetsClient();
  const [staffRes, rosterRows] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${info.name}!${STAFF_RANGE}` }),
    fetchEnlistRows(info.name, ENLIST_READ_START, enlistEndRow(company)),
  ]);
  const staffRows = staffRes.data.values ?? [];

  const nameToId = new Map();
  for (const row of rosterRows) {
    const name = (row[COL.NAME.idx] ?? "").toString().trim().toLowerCase();
    const id   = (row[COL.DISCORD.idx] ?? "").toString().trim();
    if (name && id) nameToId.set(name, id);
  }

  const etatMajor = [];
  const petitEtatMajor = [];
  STAFF_ROWS.forEach(({ row, position }, i) => {
    const rowData = staffRows[i] ?? [];
    const rank = (rowData[0] ?? "").toString().trim();
    const name = (rowData[1] ?? "").toString().trim();
    if (!name || name === "-") return;

    const entry = { position, rank, name, discordId: nameToId.get(name.toLowerCase()) ?? null };
    (row <= 22 ? etatMajor : petitEtatMajor).push(entry);
  });

  return { etatMajor, petitEtatMajor };
}

async function removeUser(userId) {
  const found = await findUser(userId);
  if (!found) return false;
  if (found.company === "Donauworth") {
    // Donauworth's real data is G:J (Discord ID at J); K/L are officer-managed
    // dropdowns and must be left untouched.
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${found.tabName}!G${found.rowNumber}:J${found.rowNumber}`,
    });
  } else {
    await clearRow(found.tabName, found.rowNumber);
  }
  return true;
}

// Which departments a member belongs to, matched by roster name (departments
// store the name, not the Discord ID). Mirrors the name-matching in
// removeFromAllDepartments. Returns display names in DEPARTMENTS order.
async function getUserDepartments(username) {
  const name = (username ?? "").toString().trim().toLowerCase();
  if (!name) return [];

  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) return [];

  const sheets = getSheetsClient();
  const result = [];
  for (const [deptName, dept] of Object.entries(DEPARTMENTS)) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${deptTab.name}!${dept.fetchRange(dept.startRow, dept.endRow)}`,
    });
    const rows  = res.data.values ?? [];
    const rowAt = (rowNumber) => rows[rowNumber - dept.startRow] ?? [];
    const isMember = deptMemberRows(dept).some(
      (rowNumber) => (rowAt(rowNumber)[dept.nameIdx] ?? "").toString().trim().toLowerCase() === name
    );
    if (isMember) result.push(deptName);
  }
  return result;
}

async function getStats(userId) {
  const found = await findUser(userId);
  if (!found) return null;
  const row = found.rowData;

  const username = (row[COL.NAME.idx] ?? "Unknown").toString();
  // Column J (idx 3) is the roster's LOA checkbox — flipped TRUE while the
  // member is on an active leave (see applyAccountability / the midnight job).
  const loaRaw   = row[3];
  const loaActive = loaRaw === true || (loaRaw ?? "").toString().trim().toUpperCase() === "TRUE";

  const [demerits, departments] = await Promise.all([
    getDemeritCount(userId).catch(() => 0),
    getUserDepartments(username).catch(() => []),
  ]);

  return {
    username,
    company:    found.company,
    rank:       (row[COL.RANK.idx]     ?? "Unknown").toString(),
    kills:      (row[COL.KILLS.idx]    ?? "0").toString(),
    kpe:        (row[COL.KPE.idx]      ?? "0").toString(),
    activity:   (row[COL.ACTIVITY.idx] ?? "0%").toString(),
    loaActive,
    demerits,
    departments,
  };
}

// Add a user to a department tab
async function addToDepartment({ userId, department, rank, username }) {
  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) throw new Error("Department tab not found");

  const dept = DEPARTMENTS[department];
  if (!dept) throw new Error(`Unknown department: ${department}`);

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!${dept.fetchRange(dept.startRow, dept.endRow)}`,
  });
  const rows = res.data.values ?? [];
  console.log(`[dept] ${department} — fetched ${rows.length} rows from ${dept.fetchRange(dept.startRow, dept.endRow)}`);
  rows.forEach((r, i) => console.log(`[dept] row ${dept.startRow + i}:`, JSON.stringify(r)));

  let targetRowNumber = null;
  for (let i = 0; i < (dept.endRow - dept.startRow + 1); i++) {
    const row = rows[i] ?? [];
    if ((row[dept.nameIdx] ?? "").toString().trim().toLowerCase() === username.toLowerCase()) {
      throw new Error("ALREADY_IN_DEPARTMENT");
    }
    if (isDeptRowAvailable(row) && targetRowNumber === null) {
      targetRowNumber = dept.startRow + i;
    }
  }
  if (targetRowNumber === null) throw new Error("NO_SPACE");

  await writeRow(deptTab.name, dept.rankCol, dept.nameCol, targetRowNumber, [rank, username]);
}

// Add a user to the Flag Department. Unlike the other two departments, flag
// members are placed in their own company's section and carry a position label
// in column K, so this writes K:M (position, rank, name) rather than L:M.
async function addToFlagDepartment({ company, position, rank, username }) {
  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) throw new Error("Department tab not found");

  const section = FLAG_SECTIONS[company];
  if (!section) throw new Error(`Unknown company: ${company}`);

  const dept   = DEPARTMENTS["Flag Department"];
  const sheets = getSheetsClient();

  // Read the whole flag block once (L:M — rank/name), then index by row number so
  // the Kommandant rows sitting inside this span are simply never considered.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!${dept.fetchRange(dept.startRow, dept.endRow)}`,
  });
  const rows   = res.data.values ?? [];
  const rowAt  = (rowNumber) => rows[rowNumber - dept.startRow] ?? [];

  // A member may only hold one flag slot — check every section, not just theirs.
  for (const rowNumber of deptMemberRows(dept)) {
    const existing = (rowAt(rowNumber)[dept.nameIdx] ?? "").toString().trim().toLowerCase();
    if (existing === username.toLowerCase()) throw new Error("ALREADY_IN_DEPARTMENT");
  }

  let targetRowNumber = null;
  for (let r = section.startRow; r <= section.endRow; r++) {
    if (isDeptRowAvailable(rowAt(r))) { targetRowNumber = r; break; }
  }
  if (targetRowNumber === null) throw new Error("SECTION_FULL");

  await writeRow(deptTab.name, dept.positionCol, dept.nameCol, targetRowNumber, [position, rank, username]);
  return { rowNumber: targetRowNumber };
}

// Move a member's Flag Department slot from their current company section into the
// destination company's section. Used by transferCompany so a flagger's flag
// profile follows them when they change companies.
//   - Returns { moved: false } if they hold no flag slot (nothing to do), or if the
//     destination company has no flag section.
//   - Throws FLAG_SECTION_FULL if the destination section has no open slot, letting
//     the caller abort the transfer before any roster rows are written.
// Carries over the same [position, rank, name] the member already held.
async function moveFlagDepartmentToCompany(username, toCompany) {
  const name = (username ?? "").toString().trim();
  if (!name) return { moved: false };

  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) return { moved: false };

  const section = FLAG_SECTIONS[toCompany];
  if (!section) return { moved: false };

  const dept   = DEPARTMENTS["Flag Department"];
  const sheets = getSheetsClient();

  // Read the whole flag block once as K:M (position, rank, name), indexed by row
  // number so Kommandant rows sitting inside the span are simply never considered.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!${dept.positionCol}${dept.startRow}:${dept.nameCol}${dept.endRow}`,
  });
  const rows   = res.data.values ?? [];
  const rowAt  = (rowNumber) => rows[rowNumber - dept.startRow] ?? [];
  const NAME_I = 2; // name is the 3rd column in the K:M read

  // Find their current flag row anywhere in the managed member rows.
  let sourceRow = null;
  for (const rowNumber of deptMemberRows(dept)) {
    const rowName = (rowAt(rowNumber)[NAME_I] ?? "").toString().trim().toLowerCase();
    if (rowName === name.toLowerCase()) { sourceRow = rowNumber; break; }
  }
  if (sourceRow === null) return { moved: false }; // not in the Flag Department

  // Preserve their exact [position, rank, name], then find an open destination slot.
  const carried = [0, 1, 2].map((i) => (rowAt(sourceRow)[i] ?? "").toString());

  let destRow = null;
  for (let r = section.startRow; r <= section.endRow; r++) {
    // A K:M row is available when its position + rank cells are both empty.
    if (isDeptRowAvailable(rowAt(r))) { destRow = r; break; }
  }
  if (destRow === null) throw new Error("FLAG_SECTION_FULL");

  await writeRow(deptTab.name, dept.positionCol, dept.nameCol, destRow, carried);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!${deptClearRange(dept, sourceRow)}`,
  });
  return { moved: true, position: carried[0] };
}

// Remove a user from ALL departments by name (used during regiment removal)
async function removeFromAllDepartments(username) {
  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) return;

  const sheets = getSheetsClient();
  for (const dept of Object.values(DEPARTMENTS)) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${deptTab.name}!${dept.fetchRange(dept.startRow, dept.endRow)}`,
    });
    const rows  = res.data.values ?? [];
    const rowAt = (rowNumber) => rows[rowNumber - dept.startRow] ?? [];

    for (const rowNumber of deptMemberRows(dept)) {
      const rowName = (rowAt(rowNumber)[dept.nameIdx] ?? "").toString().trim().toLowerCase();
      if (rowName === username.toLowerCase()) {
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SHEET_ID,
          range: `${deptTab.name}!${deptClearRange(dept, rowNumber)}`,
        });
      }
    }
  }
}

// Remove a user from a department by name
async function removeFromDepartment({ name, department }) {
  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) throw new Error("Department tab not found");

  const dept = DEPARTMENTS[department];
  if (!dept) throw new Error(`Unknown department: ${department}`);

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!${dept.fetchRange(dept.startRow, dept.endRow)}`,
  });
  const rows  = res.data.values ?? [];
  const rowAt = (rowNumber) => rows[rowNumber - dept.startRow] ?? [];

  let targetRowNumber = null;
  for (const rowNumber of deptMemberRows(dept)) {
    const rowName = (rowAt(rowNumber)[dept.nameIdx] ?? "").toString().trim().toLowerCase();
    if (rowName === name.toLowerCase()) {
      targetRowNumber = rowNumber;
      break;
    }
  }
  if (targetRowNumber === null) return false;

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!${deptClearRange(dept, targetRowNumber)}`,
  });
  return true;
}

// Promote a user — updates rank on enlist sheet and all department sections
async function promoteUser(userId, newRank) {
  const tabNames = await getTabNames();

  // 1. Find and update rank on enlist sheet
  const found = await findUser(userId);
  if (!found) return false;

  const sheets = getSheetsClient();

  // Update rank column (G) on enlist sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${found.tabName}!G${found.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newRank]] },
  });

  // Get their stored username to find them in departments
  const storedUsername = (found.rowData[COL.NAME.idx] ?? "").toString().trim();
  if (!storedUsername) return true;

  // 2. Update rank in all department sections
  const deptTab = tabNames[DEPT_GID];
  if (!deptTab) return true;

  for (const [, dept] of Object.entries(DEPARTMENTS)) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${deptTab.name}!${dept.fetchRange(dept.startRow, dept.endRow)}`,
    });
    const rows = res.data.values ?? [];
    for (let i = 0; i < rows.length; i++) {
      const rowName = (rows[i][dept.nameIdx] ?? "").toString().trim().toLowerCase();
      if (rowName === storedUsername.toLowerCase()) {
        const rowNumber = dept.startRow + i;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${deptTab.name}!${dept.rankCol}${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[newRank]] },
        });
      }
    }
  }

  return true;
}

// The live LOA tab (gid 699157387). Officers file LOAs here and the midnight EST
// job reads it. Same A:G layout as before: [discordId, tabName, rowNumber,
// leaveDate, returnDate, reason, officerId], dates DD/MM/YY.
const ACCOUNTABILITY_TAB = "LOA";
const J_COL_IDX          = 9;  // column J (LOA checkbox), 0-based absolute index

const BLACKLIST_TAB  = "Blacklisted"; // A=Discord ID, B=Username, C=Former Rank, D=Reason

const DEMERIT_GID    = 958952891;
const DEMERIT_TAB    = "Demerits";
const CORNFLOWER_BLUE = { red: 0.788, green: 0.859, blue: 0.973 }; // #c9dbf8
const I_COL_IDX      = 8; // column I (name/nickname, demerit color), 0-based absolute index
const DEMERIT_COLORS = {
  0: CORNFLOWER_BLUE,
  1: { red: 0.918, green: 0.600, blue: 0.600 }, // #ea9999
  2: { red: 0.875, green: 0.400, blue: 0.396 }, // #df6665
  3: { red: 0.800, green: 0.004, blue: 0.000 }, // #cc0100
};

function parseDate(str) {
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const day   = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year  = 2000 + parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

// "Today" as a date-only value (midnight, local Date object) in America/New_York,
// not the server's raw local clock — Railway runs in UTC, so a naive `new Date()`
// can already be "tomorrow" while it's still today in Eastern time, causing LOA
// leave/return date comparisons to silently miss by a day.
function getTodayEst() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(parseInt(p.year, 10), parseInt(p.month, 10) - 1, parseInt(p.day, 10));
}

async function getOrCreateAccountabilityTab() {
  const sheets = getSheetsClient();
  const meta   = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = meta.data.sheets.find(s => s.properties.title === ACCOUNTABILITY_TAB);
  if (existing) return existing.properties;
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: ACCOUNTABILITY_TAB } } }] },
  });
  tabNameCache = null; // invalidate cache
  return res.data.replies[0].addSheet.properties;
}

async function setCellFormat(sheetId, rowNumber, colIdx, backgroundColor) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
          cell: { userEnteredFormat: { backgroundColor } },
          fields: "userEnteredFormat.backgroundColor",
        },
      }],
    },
  });
}

async function setCellNote(sheetId, rowNumber, colIdx, note) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        updateCells: {
          range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
          rows: [{ values: [{ note }] }],
          fields: "note",
        },
      }],
    },
  });
}

async function getActiveAccountability(userId) {
  const sheets = getSheetsClient();
  await getOrCreateAccountabilityTab();
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ACCOUNTABILITY_TAB}!A:G` });
  const rows = res.data.values ?? [];
  for (const row of rows) {
    if (!(row[0] ?? "").toString().trim()) continue;
    if ((row[0] ?? "").toString().trim() !== userId.toString()) continue;
    return row;
  }
  return null;
}

async function applyAccountability({ userId, leaveDate, returnDate, reason, officerId }) {
  const record = await findUser(userId);
  if (!record) return null;
  const sheets = getSheetsClient();

  const today = getTodayEst();
  const leave = parseDate(leaveDate);
  const isToday = leave !== null && leave.getTime() === today.getTime();

  // Only flip checkbox TRUE now if the leave date is today
  if (isToday) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${record.tabName}!J${record.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[true]] },
    });
  }

  // Always add a note to the checkbox cell so the LOA info is visible in the sheet
  await setCellNote(record.sheetId, record.rowNumber, J_COL_IDX, `LOA | Leave: ${leaveDate} | Return: ${returnDate} | Reason: ${reason}`).catch(err => {
    console.error("[accountability] setCellNote failed:", err.message);
  });

  await getOrCreateAccountabilityTab();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${ACCOUNTABILITY_TAB}!A:G`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["'" + userId, record.tabName, record.rowNumber, leaveDate, returnDate, reason, (officerId ?? "").toString()]] },
  });
  return { record, isToday };
}

async function removeAccountability(userId) {
  const sheets = getSheetsClient();
  await getOrCreateAccountabilityTab();
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ACCOUNTABILITY_TAB}!A:G` });
  const rows = res.data.values ?? [];

  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] ?? "").toString().trim() !== userId.toString()) continue;
    const rowData = rows[i];
    const current = await findUser(userId);
    if (current) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${current.tabName}!J${current.rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [[false]] },
      });
      await setCellNote(current.sheetId, current.rowNumber, J_COL_IDX, "").catch(err => {
        console.error("[accountability] setCellNote failed:", err.message);
      });
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${ACCOUNTABILITY_TAB}!A${i + 1}:G${i + 1}` });
    return rowData;
  }
  return null;
}

async function clearExpiredAccountabilities() {
  const sheets = getSheetsClient();
  await getOrCreateAccountabilityTab();
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ACCOUNTABILITY_TAB}!A:G` });
  const rows = res.data.values ?? [];
  const today = getTodayEst();

  const activated   = [];
  const deactivated = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!(row[0] ?? "")) continue;

    const userId     = (row[0] ?? "").toString().trim();
    const leaveDate  = (row[3] ?? "").toString().trim();
    const returnDate = (row[4] ?? "").toString().trim();
    const officerId  = (row[6] ?? "").toString().trim();
    const leave = parseDate(leaveDate);
    const ret   = parseDate(returnDate);

    if (ret && ret <= today) {
      // Return date has arrived (or passed) — deactivate and clear row. The return
      // date itself is the first day back, mirroring how the leave date is already
      // the first inactive day for activation below.
      // Re-check this exact row is still present first: guards against a concurrent
      // run (e.g. an overlapping bot restart from a redeploy) having already cleared
      // it, which would otherwise double-send the "LOA ended" DM.
      const freshRow = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${ACCOUNTABILITY_TAB}!A${i + 1}:A${i + 1}`,
      });
      if ((freshRow.data.values?.[0]?.[0] ?? "").toString().trim() !== userId) continue;

      const current = await findUser(userId);
      if (current) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${current.tabName}!J${current.rowNumber}`,
          valueInputOption: "RAW",
          requestBody: { values: [[false]] },
        });
        await setCellNote(current.sheetId, current.rowNumber, J_COL_IDX, "").catch(err => {
          console.error("[accountability] setCellNote failed:", err.message);
        });
      }
      await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${ACCOUNTABILITY_TAB}!A${i + 1}:G${i + 1}` });
      deactivated.push({ userId, leaveDate, returnDate });
    } else if (leave && leave.getTime() === today.getTime()) {
      // Leave date is today — activate only if checkbox not already TRUE
      const current = await findUser(userId);
      if (current) {
        const checkRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${current.tabName}!J${current.rowNumber}`,
        });
        const alreadyActive = (checkRes.data.values?.[0]?.[0] ?? "").toString().toUpperCase() === "TRUE";
        if (!alreadyActive) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${current.tabName}!J${current.rowNumber}`,
            valueInputOption: "RAW",
            requestBody: { values: [[true]] },
          });
          activated.push({ userId, leaveDate, returnDate, officerId });
        }
      }
    } else if (leave && leave < today) {
      // Leave date passed but return date not yet — bot missed midnight, activate silently
      const current = await findUser(userId);
      if (current) {
        const checkRes = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${current.tabName}!J${current.rowNumber}`,
        });
        const alreadyActive = (checkRes.data.values?.[0]?.[0] ?? "").toString().toUpperCase() === "TRUE";
        if (!alreadyActive) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${current.tabName}!J${current.rowNumber}`,
            valueInputOption: "RAW",
            requestBody: { values: [[true]] },
          });
        }
      }
    }
  }

  return { activated, deactivated };
}

async function incrementRecruitCount(username) {
  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) throw new Error("Department tab not found");

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!D16:E30`,
  });
  const rows = res.data.values ?? [];

  let targetRow = null;
  for (let i = 0; i < rows.length; i++) {
    const name = (rows[i][0] ?? "").toString().trim();
    if (name.toLowerCase() === username.toLowerCase()) {
      targetRow = 16 + i;
      break;
    }
  }
  if (targetRow === null) return null;

  const rowIndex     = targetRow - 16;
  const currentCount = parseInt((rows[rowIndex]?.[1] ?? "0").toString().trim(), 10) || 0;
  const newCount     = currentCount + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!E${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newCount]] },
  });

  return newCount;
}

async function decrementRecruitCount(username) {
  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) throw new Error("Department tab not found");

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!D16:E30`,
  });
  const rows = res.data.values ?? [];

  let targetRow = null;
  for (let i = 0; i < rows.length; i++) {
    const name = (rows[i][0] ?? "").toString().trim();
    if (name.toLowerCase() === username.toLowerCase()) {
      targetRow = 16 + i;
      break;
    }
  }
  if (targetRow === null) return null;

  const rowIndex     = targetRow - 16;
  const currentCount = parseInt((rows[rowIndex]?.[1] ?? "0").toString().trim(), 10) || 0;
  const newCount     = Math.max(0, currentCount - 1);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!E${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newCount]] },
  });

  return newCount;
}

async function clearRecruitSheet() {
  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) throw new Error("Department tab not found");

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!E16:E30`,
  });
}

async function getReserveTabName() {
  const tabNames = await getTabNames();
  const info     = tabNames[RESERVE_GID];
  if (!info) throw new Error("Reserve sheet tab not found");
  return info.name;
}

async function fetchReserveBlockRows(tabName, block) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!${block.colStart}${RESERVE_START}:${block.colEnd}${RESERVE_END}`,
  });
  return res.data.values ?? [];
}

// A row is normalized to [discordId, name, rank] regardless of which block it came from
function normalizeReserveRow(row) {
  return [row[0] ?? "", row[1] ?? "", row[2] ?? ""];
}

// Searches both veteran and mercenary blocks in one round trip
async function findReserveUser(userId) {
  const tabName = await getReserveTabName();
  const sheets  = getSheetsClient();

  const veteranRange   = `${tabName}!${RESERVE_BLOCKS.veteran.colStart}${RESERVE_START}:${RESERVE_BLOCKS.veteran.colEnd}${RESERVE_END}`;
  const mercenaryRange = `${tabName}!${RESERVE_BLOCKS.mercenary.colStart}${RESERVE_START}:${RESERVE_BLOCKS.mercenary.colEnd}${RESERVE_END}`;

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: [veteranRange, mercenaryRange],
  });
  const [veteranRows, mercenaryRows] = res.data.valueRanges.map((vr) => vr.values ?? []);

  for (let i = 0; i < veteranRows.length; i++) {
    if ((veteranRows[i][0] ?? "").toString().trim() === userId) {
      return { type: "veteran", tabName, rowNumber: RESERVE_START + i, rowData: normalizeReserveRow(veteranRows[i]) };
    }
  }
  for (let i = 0; i < mercenaryRows.length; i++) {
    if ((mercenaryRows[i][0] ?? "").toString().trim() === userId) {
      return { type: "mercenary", tabName, rowNumber: RESERVE_START + i, rowData: normalizeReserveRow(mercenaryRows[i]) };
    }
  }
  return null;
}

async function reserveUser({ userId, username, rank, type }) {
  const block = RESERVE_BLOCKS[type];
  if (!block) throw new Error(`Unknown reserve type: ${type}`);

  const tabName = await getReserveTabName();
  const rows    = await fetchReserveBlockRows(tabName, block);

  let targetRow = null;
  const maxRows = RESERVE_END - RESERVE_START + 1;
  for (let i = 0; i < maxRows; i++) {
    const row = rows[i] ?? [];
    if ([0, 1, 2].every(idx => (row[idx] ?? "").toString().trim() === "")) {
      targetRow = RESERVE_START + i;
      break;
    }
  }
  if (targetRow === null) throw new Error("NO_SPACE");

  await writeRow(tabName, block.colStart, block.colEnd, targetRow, ["'" + userId, username, rank]);
}

async function removeReserveUser(userId) {
  const found = await findReserveUser(userId);
  if (!found) return false;
  const block  = RESERVE_BLOCKS[found.type];
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${found.tabName}!${block.colStart}${found.rowNumber}:${block.colEnd}${found.rowNumber}`,
  });
  return true;
}

// Reads a specialization block's rank/name columns into a Map keyed by row
// number: rowNumber -> { rank, name }. rankCol and nameCol are adjacent, so the
// read returns [rank, name] per row.
async function readSpecializationBlock(tabName, block) {
  const rows     = specializationRows(block);
  const firstRow = rows[0];
  const lastRow  = rows[rows.length - 1];
  const sheets   = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!${block.rankCol}${firstRow}:${block.nameCol}${lastRow}`,
  });
  const values = res.data.values ?? [];
  const byRow  = new Map();
  for (const rowNumber of rows) {
    const r = values[rowNumber - firstRow] ?? [];
    byRow.set(rowNumber, {
      rank: (r[0] ?? "").toString().trim(),
      name: (r[1] ?? "").toString().trim(),
    });
  }
  return byRow;
}

// Every specialization slot a member (by name) currently occupies on a company
// sheet. Returns [{ position, rowNumber }]. Match is case-insensitive/trimmed.
async function findSpecializations(company, username) {
  const tabNames = await getTabNames();
  const info     = tabNames[COMPANY_GID[company]];
  if (!info) throw new Error(`No tab found for company: ${company}`);

  const target = (username ?? "").toString().trim().toLowerCase();
  const found  = [];
  if (target === "") return found;

  for (const [position, block] of Object.entries(SPECIALIZATION_BLOCKS)) {
    const byRow = await readSpecializationBlock(info.name, block);
    for (const [rowNumber, { name }] of byRow) {
      if (name.toLowerCase() === target) found.push({ position, rowNumber });
    }
  }
  return found;
}

// Writes [rank, name] into the first open row of the given position's block.
// Throws NO_SPACE if all slots are filled.
async function assignSpecialization({ company, position, rank, username }) {
  const tabNames = await getTabNames();
  const info     = tabNames[COMPANY_GID[company]];
  if (!info) throw new Error(`No tab found for company: ${company}`);

  const block = SPECIALIZATION_BLOCKS[position];
  if (!block) throw new Error(`Unknown specialization: ${position}`);

  const byRow = await readSpecializationBlock(info.name, block);
  let targetRow = null;
  for (const rowNumber of specializationRows(block)) {
    if ((byRow.get(rowNumber)?.name ?? "") === "") { targetRow = rowNumber; break; }
  }
  if (targetRow === null) throw new Error("NO_SPACE");

  await writeRow(info.name, block.rankCol, block.nameCol, targetRow, [rank, username]);
  return { rowNumber: targetRow };
}

// Clears every specialization slot the member holds on the company sheet.
// Returns the deduped list of positions removed (empty if they held none).
async function removeSpecialization({ company, username }) {
  const tabNames = await getTabNames();
  const info     = tabNames[COMPANY_GID[company]];
  if (!info) throw new Error(`No tab found for company: ${company}`);

  const matches = await findSpecializations(company, username);
  const sheets  = getSheetsClient();
  for (const { position, rowNumber } of matches) {
    const block = SPECIALIZATION_BLOCKS[position];
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${info.name}!${block.rankCol}${rowNumber}:${block.nameCol}${rowNumber}`,
    });
  }
  return [...new Set(matches.map((m) => m.position))];
}

async function getOrCreateDemeritTab() {
  const tabNames = await getTabNames();
  const existing = Object.values(tabNames).find(t => t.name === DEMERIT_TAB);
  if (existing) return existing;
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: DEMERIT_TAB } } }] },
    });
    tabNameCache = null;
    return res.data.replies[0].addSheet.properties;
  } catch (err) {
    _auth = null;
    console.error("[demerit] failed to create Demerits tab:", err.message);
    return null;
  }
}

async function getDemeritCount(userId) {
  const sheets = getSheetsClient();
  await getOrCreateDemeritTab();
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${DEMERIT_TAB}!A:D` });
  const rows = res.data.values ?? [];
  return rows.filter(r => (r[0] ?? "").toString().trim() === userId.toString()).length;
}

async function setDemeritCell(userId, count) {
  const found = await findUser(userId);
  if (!found) return;

  const sheets  = getSheetsClient();
  const color   = DEMERIT_COLORS[Math.min(count, 3)] ?? DEMERIT_COLORS[0];
  const rowIdx  = found.rowNumber - 1; // 0-based for batchUpdate

  let note = "";
  if (count > 0) {
    const res      = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${DEMERIT_TAB}!A:B` });
    const userRows = (res.data.values ?? []).filter(r => (r[0] ?? "").toString().trim() === userId.toString());
    note = userRows.map((r, i) => `Demerit ${i + 1} | Reason: ${(r[1] ?? "").toString()}`).join("\n");
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId: found.sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: I_COL_IDX, endColumnIndex: I_COL_IDX + 1 },
            cell: { userEnteredFormat: { backgroundColor: color } },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
        {
          updateCells: {
            range: { sheetId: found.sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: I_COL_IDX, endColumnIndex: I_COL_IDX + 1 },
            rows: [{ values: [{ note }] }],
            fields: "note",
          },
        },
      ],
    },
  });
}

async function addDemerit(userId, reason, addedBy) {
  const sheets = getSheetsClient();
  await getOrCreateDemeritTab();
  const today = new Date().toLocaleDateString("en-GB");
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range:         `${DEMERIT_TAB}!A:D`,
    valueInputOption: "RAW",
    requestBody:   { values: [[userId.toString(), reason, today, addedBy.toString()]] },
  });
  const count = await getDemeritCount(userId);
  await setDemeritCell(userId, count).catch(err => console.error("[demerit] setDemeritCell failed:", err.message));
  return count;
}

// Returns new count, or null if user had no active demerits
async function removeDemerit(userId) {
  const sheets = getSheetsClient();
  await getOrCreateDemeritTab();
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${DEMERIT_TAB}!A:D` });
  const rows = res.data.values ?? [];

  // FIFO: find the oldest (first) demerit row for this user and clear its content
  let firstIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][0] ?? "").toString().trim() === userId.toString()) {
      firstIndex = i;
      break;
    }
  }
  if (firstIndex === -1) return null;

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${DEMERIT_TAB}!A${firstIndex + 1}:D${firstIndex + 1}`,
  });
  const count = await getDemeritCount(userId);
  await setDemeritCell(userId, count).catch(err => console.error("[demerit] setDemeritCell failed:", err.message));
  return count;
}

// Returns array of affected Discord user IDs
async function removeAllDemerits() {
  const sheets = getSheetsClient();
  await getOrCreateDemeritTab();
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${DEMERIT_TAB}!A:D` });
  const rows = res.data.values ?? [];

  const affectedIds = [...new Set(
    rows.filter(r => (r[0] ?? "").toString().trim()).map(r => r[0].toString().trim())
  )];

  for (const userId of affectedIds) {
    await setDemeritCell(userId, 0).catch(err => console.error("[demerit] setDemeritCell failed:", err.message));
  }
  if (rows.length > 0) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${DEMERIT_TAB}!A:D` });
  }
  return affectedIds;
}

// Add a member to the Blacklisted tab (Discord ID, Username, Former Rank, Reason)
async function exileUser({ userId, username, rank, reason }) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${BLACKLIST_TAB}!A:D`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["'" + userId, username, rank, reason]] },
  });
}

async function isExiled(userId) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BLACKLIST_TAB}!A:A` });
  const rows = res.data.values ?? [];
  return rows.some(r => (r[0] ?? "").toString().trim() === userId.toString());
}

// Returns true if a blacklist entry was found and cleared, false otherwise
async function clearExile(userId) {
  const sheets = getSheetsClient();
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BLACKLIST_TAB}!A:C` });
  const rows = res.data.values ?? [];

  const rowIndex = rows.findIndex(r => (r[0] ?? "").toString().trim() === userId.toString());
  if (rowIndex === -1) return false;

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${BLACKLIST_TAB}!A${rowIndex + 1}:C${rowIndex + 1}`,
  });
  return true;
}

// ── Promotion points (Points tab) ──────────────────────────────────────────
// The Points tab holds one row per company member: A=Username (display only),
// B=Points, C=Discord ID (the match key, text-forced with a leading apostrophe),
// D=Last updated (M/D), E=Status ("Ready" at threshold, else blank). Members are
// matched by Discord ID ONLY — never by username. Profiles are created on
// /transfer_company and reset to 0 on promotion / transfer / reserve.
const POINTS_GID = 940892160;

async function getPointsTabName() {
  const tabNames = await getTabNames();
  return tabNames[POINTS_GID]?.name ?? "Points";
}

// Month/day stamp for column D, e.g. "8/5".
function todayMD() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Read a member's Points row by Discord ID (column C, idx 2). Null if they have
// no profile (i.e. not a company member).
async function getUserPoints(userId) {
  const sheets = getSheetsClient();
  const tab    = await getPointsTabName();
  const res    = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A:E` });
  const rows   = res.data.values ?? [];
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][2] ?? "").toString().trim() !== userId.toString()) continue;
    return {
      rowNumber: i + 1,
      username:  (rows[i][0] ?? "").toString(),
      points:    parseInt((rows[i][1] ?? "0").toString(), 10) || 0,
      ready:     (rows[i][4] ?? "").toString().trim().toLowerCase() === "ready",
    };
  }
  return null;
}

// Create a fresh 0-point profile iff the Discord ID isn't already present.
// Called when a member enters a company via /transfer_company.
async function ensureProfile(userId, username) {
  const existing = await getUserPoints(userId);
  if (existing) return existing;
  const sheets = getSheetsClient();
  const tab    = await getPointsTabName();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[username ?? "", 0, "'" + userId, todayMD(), ""]] },
  });
  return { rowNumber: null, username: username ?? "", points: 0, ready: false };
}

// Recompute + write the Ready flag (col E) from the member's points vs their
// rank's threshold (rank read live from the roster). Returns the boolean.
async function refreshReadyFlag(userId, rowNumber, points) {
  const sheets = getSheetsClient();
  const tab    = await getPointsTabName();
  const found  = await findUser(userId);
  const rank   = found ? (found.rowData[COL.RANK.idx] ?? "").toString().trim() : "";
  const needed = pointsForNextRank(rank);
  const ready  = needed != null && points >= needed;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!E${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[ready ? "Ready" : ""]] },
  });
  return ready;
}

// Add (delta>0) or subtract (delta<0) points for a member, floored at 0. Stamps
// col D and recomputes the Ready flag. Returns the new state, or null if the
// member has no profile.
async function addPoints(userId, delta) {
  const current = await getUserPoints(userId);
  if (!current) return null;
  const newPoints = Math.max(0, current.points + delta);
  const sheets = getSheetsClient();
  const tab    = await getPointsTabName();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!B${current.rowNumber}:D${current.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newPoints, "'" + userId, todayMD()]] },
  });
  const ready = await refreshReadyFlag(userId, current.rowNumber, newPoints);
  return { rowNumber: current.rowNumber, username: current.username, points: newPoints, ready };
}

// Reset a member's points to 0 and clear their Ready flag (on promotion,
// transfer, or reserve). Returns false if they have no profile.
async function resetPoints(userId) {
  const current = await getUserPoints(userId);
  if (!current) return false;
  const sheets = getSheetsClient();
  const tab    = await getPointsTabName();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!B${current.rowNumber}:E${current.rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[0, "'" + userId, todayMD(), ""]] },
  });
  return true;
}

// Progress toward the member's next rank, for /my_stats. Points from the Points
// tab (by Discord ID); current rank from the roster (findUser). Null if no profile.
async function getPromotionProgress(userId) {
  const pts = await getUserPoints(userId);
  if (!pts) return null;
  const found       = await findUser(userId);
  const currentRank = found ? (found.rowData[COL.RANK.idx] ?? "").toString().trim() : "";
  const needed      = pointsForNextRank(currentRank);
  const next        = nextRank(currentRank);
  const atCeiling   = needed == null || next == null;
  const pct         = atCeiling ? 100 : Math.min(100, Math.round((pts.points / needed) * 100));
  return {
    currentRank,
    nextRank: next,
    points:   pts.points,
    needed,
    pct,
    approved: !atCeiling && pts.points >= needed,
    atCeiling,
  };
}

// Every member currently flagged Ready, joined with their live rank + company
// from the roster, grouped by the three line companies (for /current_promotions).
// Members not on a line-company roster, or with no next rank, are skipped.
async function getReadyMembers() {
  const sheets = getSheetsClient();
  const tab    = await getPointsTabName();
  const res    = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A:E` });
  const rows   = res.data.values ?? [];

  const groups = { Bayreuth: [], Rosenheim: [], Grenadier: [] };
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][4] ?? "").toString().trim().toLowerCase() !== "ready") continue;
    const userId = (rows[i][2] ?? "").toString().trim();
    if (!userId) continue;
    const found = await findUser(userId);
    if (!found || !groups[found.company]) continue;
    const rank = (found.rowData[COL.RANK.idx] ?? "").toString().trim();
    const next = nextRank(rank);
    if (!next) continue;
    groups[found.company].push({
      userId,
      username:    (rows[i][0] ?? found.rowData[COL.NAME.idx] ?? "").toString(),
      rowNumber:   i + 1,
      currentRank: rank,
      nextRank:    next,
    });
  }
  return groups;
}

module.exports = { enlistUser, enlistToDonauworth, removeUser, getStats, findUser, parseUsername, addToDepartment, addToFlagDepartment, removeFromDepartment, removeFromAllDepartments, promoteUser, getActiveAccountability, applyAccountability, removeAccountability, clearExpiredAccountabilities, findReserveUser, reserveUser, removeReserveUser, incrementRecruitCount, decrementRecruitCount, clearRecruitSheet, getDemeritCount, addDemerit, removeDemerit, removeAllDemerits, getCompanyStaff, exileUser, isExiled, clearExile, transferCompany, findSpecializations, assignSpecialization, removeSpecialization, getUserPoints, ensureProfile, addPoints, resetPoints, getPromotionProgress, getReadyMembers, getSheetsClient };
