const { google } = require("googleapis");
const crypto = require("crypto");
require("dotenv").config();

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const ENLIST_READ_START  = 15; // read from row 15 (includes all command/officer rows)
const ENLIST_START_ROW   = 23; // write only from row 23
const ENLIST_END_ROW     = 68;

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
    startRow: 18, endRow: 39,
    rankCol: "L", nameCol: "M",
    rankIdx: 0,   nameIdx: 1,
    fetchRange: (s, e) => `L${s}:M${e}`,
  },
};

let tabNameCache = null;
let _auth        = null;

// Railway sometimes strips newlines from env vars, leaving the PEM as one long line.
// This re-wraps the base64 body at 64 chars so OpenSSL can parse it.
function normalizePrivateKey(raw) {
  const pem = (raw || "").replace(/\\n/g, "\n");
  const m   = pem.match(/(-+BEGIN PRIVATE KEY-+)([\s\S]*?)(-+END PRIVATE KEY-+)/);
  if (!m) return pem;
  const body = m[2].replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? "";
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

async function fetchEnlistRows(tabName, startRow = ENLIST_READ_START) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!G${startRow}:N${ENLIST_END_ROW}`,
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

// Search both company tabs for a Discord user ID
async function findUser(userId) {
  const tabNames = await getTabNames();
  for (const [company, gid] of Object.entries(COMPANY_GID)) {
    const info = tabNames[gid];
    if (!info) continue;
    const rows = await fetchEnlistRows(info.name, ENLIST_READ_START);
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
  return null;
}

async function enlistUser({ userId, username, company, timezone, rank }) {
  const tabNames = await getTabNames();
  const gid      = COMPANY_GID[company];
  const info     = tabNames[gid];
  if (!info) throw new Error(`No tab found for company: ${company}`);

  const rows = await fetchEnlistRows(info.name, ENLIST_START_ROW);

  let targetRowNumber = null;
  for (let i = 0; i < rows.length; i++) {
    if (isEnlistRowAvailable(rows[i])) {
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
    fetchEnlistRows(info.name, ENLIST_READ_START),
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
  await clearRow(found.tabName, found.rowNumber);
  return true;
}

async function getStats(userId) {
  const found = await findUser(userId);
  if (!found) return null;
  const row = found.rowData;
  return {
    username:   (row[COL.NAME.idx]     ?? "Unknown").toString(),
    company:    found.company,
    rank:       (row[COL.RANK.idx]     ?? "Unknown").toString(),
    kills:      (row[COL.KILLS.idx]    ?? "0").toString(),
    kpe:        (row[COL.KPE.idx]      ?? "0").toString(),
    activity:   (row[COL.ACTIVITY.idx] ?? "0%").toString(),
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

// Remove a user from ALL departments by name (used during regiment removal)
async function removeFromAllDepartments(username) {
  const tabNames = await getTabNames();
  const deptTab  = tabNames[DEPT_GID];
  if (!deptTab) return;

  const sheets = getSheetsClient();
  for (const [deptName, dept] of Object.entries(DEPARTMENTS)) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${deptTab.name}!${dept.fetchRange(dept.startRow, dept.endRow)}`,
    });
    const rows = res.data.values ?? [];
    for (let i = 0; i < rows.length; i++) {
      const rowName = (rows[i][dept.nameIdx] ?? "").toString().trim().toLowerCase();
      if (rowName === username.toLowerCase()) {
        const rowNumber  = dept.startRow + i;
        const clearEnd   = dept.tallyCol ?? dept.nameCol;
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SHEET_ID,
          range: `${deptTab.name}!${dept.rankCol}${rowNumber}:${clearEnd}${rowNumber}`,
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
  const rows = res.data.values ?? [];

  let targetRowNumber = null;
  for (let i = 0; i < rows.length; i++) {
    const rowName = (rows[i][dept.nameIdx] ?? "").toString().trim().toLowerCase();
    if (rowName === name.toLowerCase()) {
      targetRowNumber = dept.startRow + i;
      break;
    }
  }
  if (targetRowNumber === null) return false;

  const clearEnd = dept.tallyCol ?? dept.nameCol;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!${dept.rankCol}${targetRowNumber}:${clearEnd}${targetRowNumber}`,
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

const ACCOUNTABILITY_TAB = "Accountability";
const J_COL_IDX          = 9;  // column J (LOA checkbox), 0-based absolute index

const BLACKLIST_TAB  = "Blacklisted"; // A=Discord ID, B=Username, C=Former Rank

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

  const today = new Date(); today.setHours(0, 0, 0, 0);
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
  const today = new Date(); today.setHours(0, 0, 0, 0);

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

    if (ret && ret < today) {
      // Return date passed — deactivate and clear row
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

// Add a member to the Blacklisted tab (Discord ID, Username, Former Rank)
async function exileUser({ userId, username, rank }) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${BLACKLIST_TAB}!A:C`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["'" + userId, username, rank]] },
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

module.exports = { enlistUser, removeUser, getStats, findUser, parseUsername, addToDepartment, removeFromDepartment, removeFromAllDepartments, promoteUser, getActiveAccountability, applyAccountability, removeAccountability, clearExpiredAccountabilities, findReserveUser, reserveUser, removeReserveUser, incrementRecruitCount, decrementRecruitCount, clearRecruitSheet, getDemeritCount, addDemerit, removeDemerit, removeAllDemerits, getCompanyStaff, exileUser, isExiled, clearExile };
