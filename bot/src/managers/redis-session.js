// src/managers/redis-session.js
const redis = require("../config/redis.js");

class RedisSessionManager {
  static sessionKey(userId) {
    return `session:${userId}`;
  }

  static mediaGroupKey(mediaGroupId) {
    return `media_group:${mediaGroupId}`;
  }

  static mediaGroupMetaKey(mediaGroupId) {
    return `media_group:${mediaGroupId}:meta`;
  }

  static lockKey(mediaGroupId) {
    return `lock:media_group:${mediaGroupId}`;
  }

  // Session 管理
  static async getActiveSession(userId) {
    const key = this.sessionKey(userId);
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  static async setSession(userId, sessionData, ttl = 3600) {
    const key = this.sessionKey(userId);
    await redis.setex(key, ttl, JSON.stringify(sessionData));
  }

  static async updateSession(userId, updates) {
    const session = await this.getActiveSession(userId);
    if (!session) return null;

    const updated = { ...session, ...updates };
    await this.setSession(userId, updated);
    return updated;
  }

  static async deleteSession(userId) {
    const key = this.sessionKey(userId);
    await redis.del(key);
  }

  // 媒體群組管理
  static async addToMediaGroup(
    mediaGroupId,
    fileData,
    sessionId,
    groupIndex,
    ttl = 60
  ) {
    const key = this.mediaGroupKey(mediaGroupId);
    const metaKey = this.mediaGroupMetaKey(mediaGroupId);

    await redis.rpush(key, JSON.stringify(fileData));
    await redis.expire(key, ttl);

    await redis.hset(metaKey, "sessionId", sessionId);
    await redis.hset(metaKey, "chatId", fileData.chatId);
    await redis.hset(metaKey, "groupIndex", groupIndex);
    await redis.expire(metaKey, ttl);
  }

  static async getMediaGroup(mediaGroupId) {
    const key = this.mediaGroupKey(mediaGroupId);
    const metaKey = this.mediaGroupMetaKey(mediaGroupId);

    const filesJson = await redis.lrange(key, 0, -1);
    const meta = await redis.hgetall(metaKey);

    return {
      files: filesJson.map((json) => JSON.parse(json)),
      sessionId: meta.sessionId,
      chatId: meta.chatId,
      groupIndex: parseInt(meta.groupIndex) || 0,
    };
  }

  static async deleteMediaGroup(mediaGroupId) {
    const key = this.mediaGroupKey(mediaGroupId);
    const metaKey = this.mediaGroupMetaKey(mediaGroupId);

    await redis.del(key);
    await redis.del(metaKey);
  }

  // 分散式鎖
  static async acquireLock(mediaGroupId, ttl = 10) {
    const key = this.lockKey(mediaGroupId);
    const lockId = `${Date.now()}-${Math.random()}`;

    const result = await redis.set(key, lockId, "NX", "EX", ttl);
    return result === "OK" ? lockId : null;
  }

  static async releaseLock(mediaGroupId, lockId) {
    const key = this.lockKey(mediaGroupId);

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    return await redis.eval(script, 1, key, lockId);
  }
}

module.exports = RedisSessionManager;
