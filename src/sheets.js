const { google } = require("googleapis");
require("dotenv").config();

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const ENLIST_READ_START  = 15; // read from row 15 (includes all command/officer rows)
const ENLIST_START_ROW   = 21; // write only from row 21
const ENLIST_END_ROW     = 67;

const COL = {
  RANK:     { letter: "F", idx: 0 },
  TIMEZONE: { letter: "G", idx: 1 },
  NAME:     { letter: "H", idx: 2 },
  DISCORD:  { letter: "I", idx: 3 },
  KILLS:    { letter: "J", idx: 4 },
  KPE:      { letter: "K", idx: 5 },
  ACTIVITY: { letter: "L", idx: 6 },
};

const COMPANY_GID = {
  Bayreuth:  261215654,
  Rosenheim: 1875189602,
};

const DEPT_GID = parseInt(process.env.DEPT_GID, 10);

// Department config: rows, columns, capacity
const DEPARTMENTS = {
  "Recruitment Department": {
    startRow: 18, endRow: 30,
    rankCol: "C", nameCol: "D",
    rankIdx: 0,   nameIdx: 1,
    fetchRange: (s, e) => `C${s}:D${e}`,
  },
  "Propaganda Department": {
    startRow: 18, endRow: 27,
    rankCol: "G", nameCol: "H",
    rankIdx: 0,   nameIdx: 1,
    fetchRange: (s, e) => `G${s}:H${e}`,
  },
  "Flag Department": {
    startRow: 18, endRow: 39,
    rankCol: "K", nameCol: "L",
    rankIdx: 0,   nameIdx: 1,
    fetchRange: (s, e) => `K${s}:L${e}`,
  },
};

let tabNameCache = null;

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

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
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
    range: `${tabName}!F${startRow}:L${ENLIST_END_ROW}`,
  });
  return res.data.values ?? [];
}

// A row is available if all target columns (indices 0-3) are empty
function isEnlistRowAvailable(row) {
  return [0, 1, 2, 3].every((i) => (row[i] ?? "").toString().trim() === "");
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
    range: `${tabName}!F${rowNumber}:I${rowNumber}`,
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

// Look up a user's rank from the enlist sheet by Discord ID
async function getUserRank(userId) {
  const found = await findUser(userId);
  if (!found) return null;
  return (found.rowData[COL.RANK.idx] ?? "").toString().trim() || null;
}

async function enlistUser({ userId, username, company, timezone, rank }) {
  const tabNames = await getTabNames();
  const gid      = COMPANY_GID[company];
  const info     = tabNames[gid];
  if (!info) throw new Error(`No tab found for company: ${company}`);

  const rows = await fetchEnlistRows(info.name);

  let targetRowNumber = null;
  for (let i = 0; i < rows.length; i++) {
    if (isEnlistRowAvailable(rows[i])) {
      targetRowNumber = ENLIST_START_ROW + i;
      break;
    }
  }
  if (targetRowNumber === null) throw new Error("NO_SPACE");

  await writeRow(info.name, "F", "I", targetRowNumber, [rank, timezone, username, userId]);
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

  let targetRowNumber = null;
  for (let i = 0; i < (dept.endRow - dept.startRow + 1); i++) {
    const row = rows[i] ?? [];
    if (isDeptRowAvailable(row)) {
      targetRowNumber = dept.startRow + i;
      break;
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
        const rowNumber = dept.startRow + i;
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SHEET_ID,
          range: `${deptTab.name}!${dept.rankCol}${rowNumber}:${dept.nameCol}${rowNumber}`,
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

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${deptTab.name}!${dept.rankCol}${targetRowNumber}:${dept.nameCol}${targetRowNumber}`,
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

  // Update rank column (F) on enlist sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${found.tabName}!F${found.rowNumber}`,
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
const PINK               = { red: 0.918, green: 0.600, blue: 0.600 };
const CORNFLOWER_BLUE    = { red: 0.788, green: 0.855, blue: 0.973 };
const H_COL_IDX          = 7; // column H is index 7 (0-based)

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
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ACCOUNTABILITY_TAB}!A:F` });
  const rows = res.data.values ?? [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const row of rows) {
    if ((row[0] ?? "") !== userId) continue;
    const ret = parseDate(row[4] ?? "");
    if (ret && ret >= today) return row;
  }
  return null;
}

async function applyAccountability({ userId, leaveDate, returnDate, reason }) {
  const record   = await findUser(userId);
  if (!record) return null;
  const tabNames = await getTabNames();
  const sheetId  = tabNames[COMPANY_GID[record.company]].sheetId;

  await setCellFormat(sheetId, record.rowNumber, H_COL_IDX, PINK);
  await setCellNote(sheetId, record.rowNumber, H_COL_IDX, `Leave: ${leaveDate} | Return: ${returnDate} | Reason: ${reason}`);

  const sheets = getSheetsClient();
  await getOrCreateAccountabilityTab();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${ACCOUNTABILITY_TAB}!A:F`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[userId, record.tabName, record.rowNumber, leaveDate, returnDate, reason]] },
  });
  return record;
}

async function clearExpiredAccountabilities() {
  const sheets = getSheetsClient();
  await getOrCreateAccountabilityTab();
  const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${ACCOUNTABILITY_TAB}!A:F` });
  const rows = res.data.values ?? [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tabNames = await getTabNames();
  let cleared = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!(row[0] ?? "")) continue;
    const ret = parseDate(row[4] ?? "");
    if (!ret || ret >= today) continue;

    const userId  = row[0];
    const current = await findUser(userId);
    if (current) {
      const sheetId = tabNames[COMPANY_GID[current.company]].sheetId;
      await setCellFormat(sheetId, current.rowNumber, H_COL_IDX, CORNFLOWER_BLUE);
      await setCellNote(sheetId, current.rowNumber, H_COL_IDX, "");
    }
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${ACCOUNTABILITY_TAB}!A${i + 1}:F${i + 1}` });
    cleared++;
  }
  return cleared;
}

async function updateUserField({ record, field, newValue, oldUsername }) {
  const sheets  = getSheetsClient();
  const tabNames = await getTabNames();

  if (field === "timezone") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${record.tabName}!G${record.rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[newValue]] },
    });
  } else if (field === "username") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${record.tabName}!H${record.rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[newValue]] },
    });
    if (oldUsername) {
      const deptTab = tabNames[DEPT_GID];
      if (deptTab) {
        for (const [, dept] of Object.entries(DEPARTMENTS)) {
          const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${deptTab.name}!${dept.fetchRange(dept.startRow, dept.endRow)}`,
          });
          const rows = res.data.values ?? [];
          for (let i = 0; i < rows.length; i++) {
            const rowName = (rows[i][dept.nameIdx] ?? "").toString().trim().toLowerCase();
            if (rowName === oldUsername.toLowerCase()) {
              await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${deptTab.name}!${dept.nameCol}${dept.startRow + i}`,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: [[newValue]] },
              });
            }
          }
        }
      }
    }
  } else if (field === "discordId") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${record.tabName}!I${record.rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[newValue]] },
    });
  }
}

module.exports = { enlistUser, removeUser, getStats, findUser, getUserRank, parseUsername, addToDepartment, removeFromDepartment, removeFromAllDepartments, promoteUser, updateUserField, getActiveAccountability, applyAccountability, clearExpiredAccountabilities };
