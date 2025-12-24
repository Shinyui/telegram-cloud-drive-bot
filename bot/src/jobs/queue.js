const { Queue } = require("bullmq");
const dotenv = require("dotenv");
const Redis = require("ioredis");

dotenv.config();

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const mediaGroupQueue = new Queue("media-group-processing", {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

const scheduleMediaGroupProcessing = async (
  mediaGroupId,
  chatId,
  sessionId,
  groupIndex,
  delayMs = 1000
) => {
  const jobId = `process_${mediaGroupId}`;

  // 嘗試移除舊的 Job 以實現 Debounce
  try {
    const job = await mediaGroupQueue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  } catch (error) {
    // 忽略移除錯誤
    console.error("Error removing job:", error);
  }

  return mediaGroupQueue.add(
    "process-media-group",
    { mediaGroupId, chatId, sessionId, groupIndex },
    {
      delay: delayMs,
      jobId: jobId,
    }
  );
};

module.exports = {
  scheduleMediaGroupProcessing,
  mediaGroupQueue,
};
