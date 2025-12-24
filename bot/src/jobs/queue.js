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
  let targetJobId = jobId;

  // 嘗試移除舊的 Job 以實現 Debounce
  try {
    const job = await mediaGroupQueue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  } catch (error) {
    // 如果移除失敗（通常是因為正在處理中），則安排一個後續任務
    console.log(`Job ${jobId} is active/locked, scheduling next job...`);
    targetJobId = `process_${mediaGroupId}_next`;

    // 嘗試 Debounce 後續任務
    try {
      const nextJob = await mediaGroupQueue.getJob(targetJobId);
      if (nextJob) {
        await nextJob.remove();
      }
    } catch (e) {
      console.log(`Next job ${targetJobId} could not be removed:`, e.message);
    }
  }

  return mediaGroupQueue.add(
    "process-media-group",
    { mediaGroupId, chatId, sessionId, groupIndex },
    {
      delay: delayMs,
      jobId: targetJobId,
    }
  );
};

module.exports = {
  scheduleMediaGroupProcessing,
  mediaGroupQueue,
};
