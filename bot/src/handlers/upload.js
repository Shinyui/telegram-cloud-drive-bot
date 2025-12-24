// src/handlers/upload.js
const RedisSessionManager = require("../managers/redis-session.js");
const UploadSessionManager = require("../managers/upload-session.js");
const {
  uploadCollectingKeyboard,
  uploadCancelKeyboard,
} = require("../utils/keyboard.js");
const {
  generateShareCode,
  formatFileSize,
  formatFileTypeStats,
} = require("../utils/helpers.js");

// 用來追蹤收集訊息的 ID
const collectingMessages = new Map();

const registerUploadHandlers = (bot) => {
  // 開始上傳
  bot.callbackQuery("upload_start", async (ctx) => {
    await ctx.answerCallbackQuery();

    const userId = ctx.from.id;

    // 檢查是否有活躍 session
    const existingSession = await UploadSessionManager.getActive(userId);

    if (existingSession) {
      await UploadSessionManager.cancel(existingSession.id);
      await RedisSessionManager.deleteSession(userId);
    }

    // 創建新 session
    const session = await UploadSessionManager.create(userId);

    await RedisSessionManager.setSession(
      userId,
      {
        id: session.id,
        status: "COLLECTING",
        currentGroupIndex: 0, // 當前組索引
      },
      3600
    );

    await ctx.editMessageText(
      "📤 请发送你要存储的内容，可以多张图片/视频/文件，也可转发消息。\n" +
        "若需要设置预览，第一组文件将作为预览内容。"
    );

    await ctx.reply("👇 操作：", {
      reply_markup: uploadCancelKeyboard(),
    });
  });

  // 繼續添加
  bot.callbackQuery("upload_continue", async (ctx) => {
    await ctx.answerCallbackQuery("✅ 继续添加文件");

    const session = await RedisSessionManager.getActiveSession(ctx.from.id);

    if (!session) {
      return ctx.answerCallbackQuery("❌ Session 已过期");
    }

    // 增加組索引
    await RedisSessionManager.updateSession(ctx.from.id, {
      currentGroupIndex: (session.currentGroupIndex || 0) + 1,
    });

    await ctx.reply("📤 继续发送文件...");
  });

  // 完成存儲
  bot.callbackQuery("upload_complete", async (ctx) => {
    await ctx.answerCallbackQuery();

    const userId = ctx.from.id;
    const redisSession = await RedisSessionManager.getActiveSession(userId);

    if (!redisSession) {
      return ctx.editMessageText("❌ Session 已过期");
    }

    // --- 關鍵修改：從 Redis 暫存區一次性入庫 ---
    
    // 1. 獲取所有暫存文件
    const files = await RedisSessionManager.getSessionFiles(userId);
    
    if (!files || files.length === 0) {
      // 雙重檢查：如果 Redis 沒文件，看看資料庫裡是否已經有了 (應對極端情況)
      const dbSession = await UploadSessionManager.getActive(userId);
      if (!dbSession || dbSession.totalFiles === 0) {
        return ctx.editMessageText("❌ 还没有上传任何文件");
      }
      // 如果 DB 有文件但 Redis 沒有，說明可能已經部分入庫或數據異常，繼續流程
    } else {
      // 2. 批量入庫
      const session = await UploadSessionManager.getActive(userId);
      
      // 按消息ID排序，確保順序正確
      files.sort((a, b) => a.messageId - b.messageId);
      
      await UploadSessionManager.addFiles(
        session.id,
        files,
        0, // 這裡 groupIndex 其實已經在 file 對象裡了，但 addFiles 接口目前可能覆蓋它
           // 我們需要稍微修改 addFiles 或者這裡分組處理
           // 簡單起見，我們假設 files 裡的 groupIndex 是正確的，修改 addFiles 讓它優先使用 file 裡的
        null
      );
      
      // 3. 清空 Redis 暫存
      await RedisSessionManager.clearSessionFiles(userId);
    }

    // --- 修改結束 ---

    const session = await UploadSessionManager.getActive(userId);

    if (!session || session.totalFiles === 0) {
      return ctx.editMessageText("❌ 还没有上传任何文件");
    }

    // 更新狀態
    await UploadSessionManager.updateStatus(session.id, "SETTING");
    await RedisSessionManager.updateSession(userId, {
      status: "SETTING",
    });

    await ctx.editMessageText(
      "📝 请设置分享标题\n\n" +
        "💡 支持关键词格式：\n" +
        "• 普通标题：这是一个资源标题\n" +
        "• 带关键词：这是关键词|这是一个资源标题\n" +
        "  （使用 | 分隔，前半部分为关键词，后半部分为标题）\n\n" +
        "⚠️ 注意：\n" +
        "• 标题至少需要5个字符，最多200个字符\n" +
        "• 一个分享只能有一个关键词\n" +
        "• 关键词不能重复\n" +
        "• 关键词用法：用户在频道评论区发送|前的关键词即可获取资源跳转按钮"
    );
  });

  // 取消上傳
  bot.callbackQuery("upload_cancel", async (ctx) => {
    await ctx.answerCallbackQuery();

    const session = await RedisSessionManager.getActiveSession(ctx.from.id);

    if (session) {
      await UploadSessionManager.cancel(session.id);
      await RedisSessionManager.deleteSession(ctx.from.id);
    }

    await ctx.editMessageText("❌ 已取消上传");
  });

  // 處理標題輸入
  bot.on("message:text", async (ctx) => {
    const session = await RedisSessionManager.getActiveSession(ctx.from.id);

    if (!session || session.status !== "SETTING") {
      return;
    }

    const text = ctx.message.text.trim();

    // 驗證長度
    if (text.length < 5) {
      return ctx.reply("❌ 标题至少需要5个字符");
    }

    if (text.length > 200) {
      return ctx.reply("❌ 标题最多200个字符");
    }

    // 解析標題和關鍵字
    let keyword = null;
    let title = text;

    if (text.includes("|")) {
      const parts = text.split("|");
      keyword = parts[0].trim();
      title = parts.slice(1).join("|").trim();

      // 檢查關鍵字是否重複
      const existing = await UploadSessionManager.getByKeyword(keyword);
      if (existing) {
        return ctx.reply("❌ 关键词已存在，请使用其他关键词");
      }
    }

    // 生成分享碼
    const shareCode = generateShareCode();

    // 生成分享連結
    const shareLink = `https://t.me/${ctx.me.username}?start=${shareCode}`;

    // 完成上傳
    const completedSession = await UploadSessionManager.complete(
      session.id,
      title,
      keyword,
      shareCode,
      shareLink,
      false // preventForward
    );

    await RedisSessionManager.deleteSession(ctx.from.id);

    // 統計資訊
    const fileTypeStats = formatFileTypeStats(completedSession.files);

    await ctx.reply(
      "✅ 分享创建成功！\n\n" +
        `📋 分享标题：${title}\n` +
        `📊 文件统计：共 ${completedSession.totalFiles} 个文件\n` +
        `📁 文件类型：${fileTypeStats}\n` +
        `💾 总大小：${formatFileSize(Number(completedSession.totalSize))}\n` +
        `🔒 转发限制：${
          completedSession.preventForward ? "已启用" : "未启用"
        }\n` +
        `${keyword ? `🔍 关键词：${keyword} (群组可用)\n` : ""}\n` +
        `🔗 分享链接：\n${shareLink}\n\n` +
        `🆔 分享码：\`${shareCode}\`\n\n` +
        `💡 点击分享码可复制，发送给好友即可获取文件`,
      { parse_mode: "Markdown" }
    );
  });
};

module.exports = registerUploadHandlers;
