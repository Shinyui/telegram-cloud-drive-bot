const { Bot } = require("grammy");
const dotenv = require("dotenv");

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN);

// 錯誤處理
bot.catch((err) => {
  console.error("Bot error:", err);
});

module.exports = bot;
