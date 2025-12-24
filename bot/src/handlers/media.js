// src/handlers/media.js
const RedisSessionManager = require("../managers/redis-session.js");
const UploadSessionManager = require("../managers/upload-session.js");
const { scheduleMediaGroupProcessing } = require("../jobs/queue.js"); // ← 確保這行正確
const { uploadCollectingKeyboard } = require("../utils/keyboard.js");

const handleMediaUpload = async (ctx, mediaType, bot) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const mediaGroupId = ctx.message.media_group_id;

  console.log(ctx);

  let session = await RedisSessionManager.getActiveSession(userId);

  if (!session) {
    const dbSession = await UploadSessionManager.getActive(userId);

    if (dbSession && dbSession.status === "COLLECTING") {
      session = {
        id: dbSession.id,
        status: dbSession.status,
        currentGroupIndex: 0,
      };
      await RedisSessionManager.setSession(userId, session);
    } else {
      return ctx.reply(
        "❌ 请先点击「开始存储」\n\n" + "使用 /start 回到主选单"
      );
    }
  }

  if (session.status !== "COLLECTING") {
    return ctx.reply("❌ 当前不是收集文件阶段");
  }

  // 提取檔案資訊
  let file, fileName, fileSize, mimeType;

  switch (mediaType) {
    case "PHOTO":
      file = ctx.message.photo[ctx.message.photo.length - 1];
      fileName = `photo_${ctx.message.message_id}.jpg`;
      fileSize = file.file_size;
      mimeType = "image/jpeg";
      break;
    case "VIDEO":
      file = ctx.message.video;
      fileName = file.file_name || `video_${ctx.message.message_id}.mp4`;
      fileSize = file.file_size;
      mimeType = file.mime_type;
      break;
    case "DOCUMENT":
      file = ctx.message.document;
      fileName = file.file_name;
      fileSize = file.file_size;
      mimeType = file.mime_type;
      break;
    case "AUDIO":
      file = ctx.message.audio;
      fileName = file.file_name || `audio_${ctx.message.message_id}.mp3`;
      fileSize = file.file_size;
      mimeType = file.mime_type;
      break;
    case "VOICE":
      file = ctx.message.voice;
      fileName = `voice_${ctx.message.message_id}.ogg`;
      fileSize = file.file_size;
      mimeType = file.mime_type;
      break;
  }

  const fileData = {
    fileId: file.file_id,
    type: mediaType,
    fileName,
    fileSize,
    mimeType,
    caption: ctx.message.caption,
    captionEntities: ctx.message.caption_entities,
    messageId: ctx.message.message_id,
    chatId: ctx.chat.id,
    receivedAt: Date.now(),
  };

  const currentGroupIndex = session.currentGroupIndex || 0;

  // 處理媒體群組 vs 單一檔案
  if (mediaGroupId) {
    // 添加到 Redis
    await RedisSessionManager.addToMediaGroup(
      mediaGroupId,
      fileData,
      session.id,
      currentGroupIndex
    );

    // 取得當前數量
    const { files } = await RedisSessionManager.getMediaGroup(mediaGroupId);

    // 移除中間狀態的通知訊息逻辑
    // 我們現在完全依賴 Worker 在處理完成後發送最終匯總通知

    // 排程處理 - 確保參數正確
    try {
      await scheduleMediaGroupProcessing(
        mediaGroupId,
        chatId,
        session.id,
        currentGroupIndex,
        3000 // 增加延遲時間到 3 秒
      );
    } catch (error) {
      console.error("Schedule error:", error);
      // 如果 BullMQ 有問題，直接處理
      await processMediaGroupDirectly(
        mediaGroupId,
        chatId,
        session.id,
        currentGroupIndex,
        bot
      );
    }
  } else {
    // 單一檔案：直接儲存
    await UploadSessionManager.addFiles(
      session.id,
      [fileData],
      currentGroupIndex,
      null
    );

    // 取得更新後的 session
    const updatedSession = await UploadSessionManager.getActive(userId);

    // 統計本次（其實就這一個）檔案類型
    const typeStats = { [fileData.type]: 1 };
    const statsText = Object.entries(typeStats)
      .map(([type, count]) => `• ${type}: ${count}`)
      .join("\n");

    // 發送確認訊息
    await ctx.reply(
      `✅ 正在接收文件...请确保所有文件都已发送完毕\n` +
        `📁 总计共添加 ${updatedSession.totalFiles} 个文件\n` +
        `📊 本次接收：\n${statsText}\n\n` +
        `继续发送更多文件，或选择操作：`,
      { reply_markup: uploadCollectingKeyboard() }
    );
  }
};

const processMediaGroupDirectly = async (
  mediaGroupId,
  chatId,
  sessionId,
  groupIndex,
  bot
) => {
  const lockId = await RedisSessionManager.acquireLock(mediaGroupId, 10);

  if (!lockId) return;

  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const { files } = await RedisSessionManager.getMediaGroup(mediaGroupId);

    if (files.length === 0) return;

    files.sort((a, b) => a.messageId - b.messageId);

    await UploadSessionManager.addFiles(
      sessionId,
      files,
      groupIndex,
      mediaGroupId
    );

    const updatedSession = await UploadSessionManager.getActive(
      files[0].chatId
    );

    await bot.api.sendMessage(
      chatId,
      `✅ 正在接收文件...请确保所有文件都已发送完毕\n` +
        `📁 总计共添加 ${updatedSession.totalFiles} 个文件\n\n` +
        `继续发送更多文件，或选择操作：`,
      { reply_markup: uploadCollectingKeyboard() }
    );

    await RedisSessionManager.deleteMediaGroup(mediaGroupId);
  } finally {
    await RedisSessionManager.releaseLock(mediaGroupId, lockId);
  }
};

const registerMediaHandlers = function (bot) {
  bot.on("message:photo", (ctx) => handleMediaUpload(ctx, "PHOTO", bot));
  bot.on("message:video", (ctx) => handleMediaUpload(ctx, "VIDEO", bot));
  bot.on("message:document", (ctx) => handleMediaUpload(ctx, "DOCUMENT", bot));
  bot.on("message:audio", (ctx) => handleMediaUpload(ctx, "AUDIO", bot));
  bot.on("message:voice", (ctx) => handleMediaUpload(ctx, "VOICE", bot));
};

module.exports = registerMediaHandlers;
