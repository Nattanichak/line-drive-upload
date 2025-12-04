const express = require("express");
const line = require("@line/bot-sdk");
const { google } = require("googleapis");
const fs = require("fs");
const os = require("os");
const path = require("path");

const config = {
  channelAccessToken: process.env.LINE_TOKEN,
  channelSecret: process.env.LINE_SECRET
};

const app = express();
app.use(express.json());

// Setup Google Auth using credentials from env
const googleCreds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials: googleCreds,
  scopes: ["https://www.googleapis.com/auth/drive"]
});
const drive = google.drive({ version: "v3", auth });

app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Error");
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "image") return;

  const client = new line.Client(config);
  const messageId = event.message.id;

  // ดาวน์โหลดรูปจาก LINE
  const stream = await client.getMessageContent(messageId);
  const tmpPath = path.join(os.tmpdir(), `line_${Date.now()}.jpg`);
  const out = fs.createWriteStream(tmpPath);
  stream.pipe(out);

  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });

  // อัปโหลดขึ้น Google Drive
  const fileMetadata = {
    name: `line_${Date.now()}.jpg`,
    parents: [process.env.GDRIVE_FOLDER] // folder id
  };
  const media = {
    mimeType: "image/jpeg",
    body: fs.createReadStream(tmpPath)
  };

  await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id, webViewLink"
  });

  // ลบไฟล์ชั่วคราว
  fs.unlinkSync(tmpPath);

  // ตอบกลับผู้ส่ง
  await client.replyMessage(event.replyToken, {
    type: "text",
    text: "อัปโหลดภาพขึ้น Google Drive เรียบร้อยแล้ว 👍"
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on " + PORT));
