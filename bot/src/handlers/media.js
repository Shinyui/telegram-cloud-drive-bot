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
  // 無論是單一文件還是媒體群組，都先存入 Redis 暫存列表

  // 為了保持和原有 groupIndex 邏輯兼容，我們將 fileData 增加 groupIndex
  fileData.groupIndex = currentGroupIndex;
  fileData.mediaGroupId = mediaGroupId || null;

  // 1. 存入 Redis 用戶暫存列表
  await RedisSessionManager.addFileToSession(userId, fileData);

  // 2. 如果是媒體群組，仍然需要 Debounce 處理來發送「匯總通知」
  if (mediaGroupId) {
    // 添加到 MediaGroup (為了計算數量和 Debounce)
    await RedisSessionManager.addToMediaGroup(
      mediaGroupId,
      fileData,
      session.id,
      currentGroupIndex
    );

    // 排程處理通知（只更新 UI，不入庫）
    try {
      await scheduleMediaGroupProcessing(
        mediaGroupId,
        chatId,
        session.id,
        currentGroupIndex,
        1000
      );
    } catch (error) {
      console.error("Schedule error:", error);
    }
  } else {
    // 單一文件：直接發送/更新通知
    // 獲取當前暫存文件數量
    const currentFiles = await RedisSessionManager.getSessionFiles(userId);
    const totalCount = currentFiles.length;

    // 這裡可以選擇：每發一個文件都發一條通知，或者嘗試編輯上一條通知
    // 為了簡單且反饋即時，單文件我們直接發送一條狀態消息，或者編輯「收集消息」

    // 嘗試獲取最後一條收集狀態消息 ID (這裡簡化處理，直接發送新消息，用戶體驗類似「一次性」是因為我們稍後會刪除這些消息或只保留最後一條)
    // 但為了達到「一次性入庫」的感覺，我們這裡發送一個「已添加到暫存區」的提示，或者什麼都不發（如果用戶發很快）

    // 為了讓用戶知道機器人活著，我們發送一個帶有「完成存儲」按鈕的消息
    // 如果用戶連續發送，這條消息會被刷下去，但這是 Telegram 的限制
    await ctx.reply(
      `✅ 已暫存 1 個文件 (總暫存: ${totalCount} 個)\n` +
        `請繼續發送，或點擊「完成存儲」結束。`,
      { reply_markup: uploadCollectingKeyboard() }
    );
  }
};

// 用於更新 UI 的函數 (不再負責入庫)
const processMediaGroupDirectly = async (
  mediaGroupId,
  chatId,
  sessionId,
  groupIndex,
  bot
) => {
  // 這裡不再需要實現，因為我們完全依賴 Worker 來做 UI 更新
};

const registerMediaHandlers = function (bot) {
  bot.on("message:photo", (ctx) => handleMediaUpload(ctx, "PHOTO", bot));
  bot.on("message:video", (ctx) => handleMediaUpload(ctx, "VIDEO", bot));
  bot.on("message:document", (ctx) => handleMediaUpload(ctx, "DOCUMENT", bot));
  bot.on("message:audio", (ctx) => handleMediaUpload(ctx, "AUDIO", bot));
  bot.on("message:voice", (ctx) => handleMediaUpload(ctx, "VOICE", bot));
};

module.exports = registerMediaHandlers;
