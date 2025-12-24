// src/jobs/media-group.js
const { Worker } = require("bullmq");
const RedisSessionManager = require("../managers/redis-session.js");
const UploadSessionManager = require("../managers/upload-session.js");
const bot = require("../bot.js");
const Redis = require("ioredis");

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const mediaGroupWorker = new Worker(
  "media-group-processing",
  async (job) => {
    const { mediaGroupId, chatId, sessionId, groupIndex } = job.data;

    console.log(`🔄 Processing media group: ${mediaGroupId}`);

    const lockId = await RedisSessionManager.acquireLock(mediaGroupId, 10);

    if (!lockId) {
      console.log(
        `⏭️  Already processing (locked): ${mediaGroupId}, retrying later...`
      );
      throw new Error("Media group locked");
    }

    try {
      // 這裡只做 claim (清空 media group 列表)，不入庫
      const { files } = await RedisSessionManager.claimMediaGroup(mediaGroupId);

      if (files.length === 0) {
        return { alreadyProcessed: true };
      }

      // 獲取當前用戶的所有暫存文件，用於計算總數
      // 注意：這裡我們假設 files[0] 裡有 chatId，然後反查 userId 可能比較麻煩
      // 但我們可以直接用 session 中的 userId (雖然這裡沒傳，但可以傳)
      // 或者簡單點，我們只顯示「本次已接收 X 個文件」
      
      // 為了更好的體驗，我們獲取一下當前 session 的總文件數
      // 由於 redis session key 是 userId，我們需要知道 userId
      // 這裡暫時只顯示本次接收數量，或者修改 job 數據傳入 userId
      
      const fileCount = files.length;

      await bot.api.sendMessage(
        chatId,
        `✅ 已暫存 ${fileCount} 個文件 (來自媒體群組)\n` +
        `請繼續發送，或點擊「完成存儲」結束。`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ 完成存儲", callback_data: "upload_complete" }],
              [{ text: "❌ 取消", callback_data: "upload_cancel" }],
            ],
          },
        }
      );

      return { success: true, fileCount: files.length };
    } catch (error) {
      console.error(`❌ Failed: ${mediaGroupId}`, error);
      throw error;
    } finally {
      await RedisSessionManager.releaseLock(mediaGroupId, lockId);
    }
  },
  { connection, concurrency: 5 }
);

mediaGroupWorker.on("completed", (job) => {
  console.log(`✅ Completed: ${job.id}`);
});

mediaGroupWorker.on("failed", (job, err) => {
  console.error(`❌ Failed: ${job?.id}`, err.message);
});
