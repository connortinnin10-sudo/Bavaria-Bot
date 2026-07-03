require("dotenv").config();
const { google } = require("googleapis");

async function test() {
  console.log("Testing Google Sheets connection...");
  console.log("Service account:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  console.log("Sheet ID:", process.env.GOOGLE_SHEET_ID);

  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  console.log("Private key starts with:", privateKey.slice(0, 40));

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  try {
    console.log("\nStep 1: Authenticating with Google...");
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    console.log("✅ Auth successful, got token");
  } catch (err) {
    console.error("❌ Auth failed:", err.message);
    return;
  }

  try {
    console.log("\nStep 2: Accessing the spreadsheet...");
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
    });
    console.log("✅ Sheet found:", res.data.properties.title);
    console.log("Tabs:", res.data.sheets.map((s) => `${s.properties.title} (gid: ${s.properties.sheetId})`).join(", "));
  } catch (err) {
    console.error("❌ Sheet access failed:", err.message);
  }
}

test();
