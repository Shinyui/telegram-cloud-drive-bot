const express = require("express");
const { webhookCallback } = require("grammy");
const bot = require("./bot.js");
const redis = require("./config/redis.js");
const { prisma, connectDatabase } = require("./config/prisma.js");
const registerStartHandlers = require("./handlers/start.js");
const registerUploadHandlers = require("./handlers/upload.js");
const registerMediaHandlers = require("./handlers/media.js");
const registerDownloadHandlers = require("./handlers/download.js");
require("./jobs/media-group.js"); // 啟動 worker
const dotenv = require("dotenv");
dotenv.config();

const app = express();

// Debug middleware to log all updates
bot.use(async (ctx, next) => {
  console.log(
    `📩 Received update: ${ctx.update.update_id} [${Object.keys(ctx.update)
      .filter((k) => k !== "update_id")
      .join(", ")}]`
  );
  if (ctx.message && ctx.message.text) {
    console.log(`📝 Text: ${ctx.message.text}`);
  }
  await next();
});

// 註冊所有 handlers
registerStartHandlers(bot);
registerDownloadHandlers(bot); // 移動到這裡
registerUploadHandlers(bot);
registerMediaHandlers(bot);

// 健康檢查
app.get("/health", async (req, res) => {
  try {
    await redis.ping();
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: "ok",
      redis: "connected",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      error: error.message,
    });
  }
});

app.get("/", (req, res) => {
  res.send("Telegram Cloud Bot is running!");
});

app.use(express.json());
const WEBHOOK_PATH =
  process.env.WEBHOOK_PATH || `/webhook/${process.env.BOT_TOKEN}`;
app.use(WEBHOOK_PATH, webhookCallback(bot, "express"));

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  await connectDatabase();

  try {
    const baseUrl =
      process.env.WEBHOOK_URL ||
      process.env.APP_BASE_URL ||
      `http://localhost:${PORT}`;
    const normalizedBase = baseUrl.replace(/\/+$/, "");
    const normalizedPath = WEBHOOK_PATH.startsWith("/")
      ? WEBHOOK_PATH
      : `/${WEBHOOK_PATH}`;
    const webhookUrl = `${normalizedBase}${normalizedPath}`;
    await bot.api.setWebhook(webhookUrl);
    console.log(`✅ Webhook set: ${webhookUrl}`);
  } catch (error) {
    console.error("❌ Error setting webhook:", error);
  }

  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || "development"}`);
});

// 優雅關閉
process.once("SIGINT", async () => {
  console.log("Shutting down...");
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

process.once("SIGTERM", async () => {
  console.log("Shutting down...");
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});
