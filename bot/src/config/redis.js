const Redis = require("ioredis");
const dotenv = require("dotenv");

dotenv.config();

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("ready", () => {
  console.log("✅ Redis ready");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});

redis.on("close", () => {
  console.log("⚠️  Redis connection closed");
});

module.exports = redis;
