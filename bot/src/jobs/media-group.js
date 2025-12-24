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
      const { files } = await RedisSessionManager.claimMediaGroup(mediaGroupId);

      if (files.length === 0) {
        return { alreadyProcessed: true };
      }

      files.sort((a, b) => a.messageId - b.messageId);

      await UploadSessionManager.addFiles(
        sessionId,
        files,
        groupIndex,
        mediaGroupId
      );

      const updatedSession = await UploadSessionManager.getActive(
        (
          await bot.api.getChat(chatId)
        ).id
      );

      // 統計本次接收的檔案類型
      const typeStats = {};
      let totalSize = 0;
      files.forEach((f) => {
        typeStats[f.type] = (typeStats[f.type] || 0) + 1;
        totalSize += f.fileSize || 0;
      });

      const statsText = Object.entries(typeStats)
        .map(([type, count]) => `• ${type}: ${count}`)
        .join("\n");

      const formatSize = (bytes) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
      };

      await bot.api.sendMessage(
        chatId,
        `✅ 正在接收文件...请确保所有文件都已发送完毕\n` +
          `📁 总计共添加 ${updatedSession.totalFiles} 个文件\n` +
          `📊 本次接收 (${formatSize(totalSize)})：\n${statsText}\n\n` +
          `继续发送更多文件，或选择操作：`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ 完成存储", callback_data: "upload_complete" }],
              [{ text: "❌ 取消", callback_data: "upload_cancel" }],
            ],
          },
        }
      );

      // await RedisSessionManager.deleteMediaGroup(mediaGroupId);

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
