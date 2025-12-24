const { mainMenuKeyboard } = require("../utils/keyboard.js");
const UploadSessionManager = require("../managers/upload-session.js");

const registerStartHandlers = (bot) => {
  bot.command("start", async (ctx) => {
    const param = ctx.match?.trim();

    // 如果有參數，檢查是否為分享碼
    if (param) {
      const session = await UploadSessionManager.getByShareCode(param);

      if (session) {
        // 交給 download handler 處理
        return; // download handler 會接管
      }
    }

    // 顯示主選單
    await ctx.reply(
      "🌟 欢迎使用 Telegram 云端文件机器人！\n\n" +
        "功能：\n" +
        "• 📤 存储文件（图片、视频、文件）\n" +
        "• 📥 通过分享码或关键词获取文件\n" +
        "• 🔍 使用关键词快速查找\n" +
        "• 📋 管理你的存储记录\n\n" +
        "请选择功能：",
      { reply_markup: mainMenuKeyboard() }
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📖 使用说明\n\n" +
        "🔹 存储文件：\n" +
        "1. 点击「开始存储」\n" +
        "2. 发送你的文件（可多个）\n" +
        "3. 点击「完成存储」\n" +
        "4. 输入标题（可选关键词）\n" +
        "5. 获得分享码\n\n" +
        "🔹 获取文件：\n" +
        "方法1：/get <分享码/关键词>\n" +
        "方法2：点击分享链接\n\n" +
        "🔹 查看存储记录：\n" +
        "点击「我的存储」"
    );
  });

  // 我的存储
  bot.callbackQuery("my_uploads", async (ctx) => {
    await ctx.answerCallbackQuery();

    const uploads = await UploadSessionManager.getUserUploads(ctx.from.id, 10);

    const { InlineKeyboard } = require("grammy");
    const backButton = new InlineKeyboard().text("🔙 返回主选单", "main_menu");

    if (uploads.length === 0) {
      return ctx.editMessageText("📭 你还没有任何存储记录", {
        reply_markup: backButton,
      });
    }

    const text = uploads
      .map((upload, i) => {
        return (
          `${i + 1}. 📝 ${upload.title}\n` +
          `   🔑 \`${upload.shareCode}\`\n` +
          `   📄 ${upload.totalFiles} 个文件\n` +
          `   ${upload.keyword ? `🔍 ${upload.keyword}\n` : ""}` +
          `   📅 ${new Date(upload.createdAt).toLocaleString()}`
        );
      })
      .join("\n\n");

    await ctx.editMessageText("📋 你的存储记录：\n\n" + text, {
      parse_mode: "Markdown",
      reply_markup: backButton,
    });
  });

  // 處理返回主選單
  bot.callbackQuery("main_menu", async (ctx) => {
    await ctx.answerCallbackQuery();

    await ctx.editMessageText(
      "🌟 欢迎使用 Telegram 云端文件机器人！\n\n" +
        "功能：\n" +
        "• 📤 存储文件（图片、视频、文件）\n" +
        "• 📥 通过分享码或关键词获取文件\n" +
        "• 🔍 使用关键词快速查找\n" +
        "• 📋 管理你的存储记录\n\n" +
        "请选择功能：",
      { reply_markup: mainMenuKeyboard() }
    );
  });
};

module.exports = registerStartHandlers;
