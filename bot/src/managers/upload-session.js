// src/managers/upload-session.js
const { prisma } = require("../config/prisma.js");

class UploadSessionManager {
  // 創建新的上傳 session
  static async create(userId) {
    try {
      return await prisma.uploadSession.create({
        data: {
          userId: BigInt(userId),
          status: "COLLECTING",
        },
      });
    } catch (error) {
      console.error("Create session error:", error);
      throw error;
    }
  }

  static async getActive(userId) {
    try {
      return await prisma.uploadSession.findFirst({
        where: {
          userId: BigInt(userId),
          status: { in: ["COLLECTING", "SETTING"] },
        },
        include: {
          files: {
            orderBy: [{ groupIndex: "asc" }, { messageId: "asc" }],
          },
        },
      });
    } catch (error) {
      console.error("Get active session error:", error);
      throw error;
    }
  }

  static async addFiles(sessionId, files, groupIndex, mediaGroupId = null) {
    try {
      const created = await prisma.mediaFile.createMany({
        data: files.map((file, index) => ({
          sessionId,
          telegramFileId: file.fileId,
          fileType: file.type,
          fileName: file.fileName,
          fileSize: file.fileSize ? BigInt(file.fileSize) : null,
          mimeType: file.mimeType,
          caption: file.caption,
          captionEntities: file.captionEntities
            ? JSON.stringify(file.captionEntities)
            : null,
          order: index,
          messageId: file.messageId,
          chatId: BigInt(file.chatId),
          // 優先使用文件自帶的 groupIndex 和 mediaGroupId
          groupIndex: file.groupIndex !== undefined ? file.groupIndex : groupIndex,
          mediaGroupId: file.mediaGroupId || mediaGroupId,
        })),
      });

      const totalSize = files.reduce((sum, f) => sum + (f.fileSize || 0), 0);

      await prisma.uploadSession.update({
        where: { id: sessionId },
        data: {
          totalFiles: { increment: files.length },
          totalSize: { increment: totalSize },
        },
      });

      return created;
    } catch (error) {
      console.error("Add files error:", error);
      throw error;
    }
  }

  static async updateStatus(sessionId, status) {
    try {
      return await prisma.uploadSession.update({
        where: { id: sessionId },
        data: { status },
      });
    } catch (error) {
      console.error("Update status error:", error);
      throw error;
    }
  }

  static async complete(
    sessionId,
    title,
    keyword,
    shareCode,
    shareLink,
    preventForward = false
  ) {
    try {
      return await prisma.uploadSession.update({
        where: { id: sessionId },
        data: {
          status: "COMPLETED",
          title,
          keyword,
          shareCode,
          shareLink,
          preventForward,
        },
        include: {
          files: {
            orderBy: [{ groupIndex: "asc" }, { messageId: "asc" }],
          },
        },
      });
    } catch (error) {
      console.error("Complete session error:", error);
      throw error;
    }
  }

  static async cancel(sessionId) {
    try {
      return await prisma.uploadSession.update({
        where: { id: sessionId },
        data: { status: "CANCELLED" },
      });
    } catch (error) {
      console.error("Cancel session error:", error);
      throw error;
    }
  }

  static async getByShareCode(shareCode) {
    try {
      console.log("Getting session by share code:", shareCode);
      console.log("Prisma instance:", prisma ? "exists" : "undefined");

      if (!prisma) {
        throw new Error("Prisma instance is undefined");
      }

      const session = await prisma.uploadSession.findUnique({
        where: { shareCode },
        include: {
          files: {
            orderBy: [{ groupIndex: "asc" }, { messageId: "asc" }],
          },
        },
      });

      console.log("Found session:", session ? session.id : "null");
      return session;
    } catch (error) {
      console.error("Get by share code error:", error);
      throw error;
    }
  }

  static async getByKeyword(keyword) {
    try {
      return await prisma.uploadSession.findFirst({
        where: {
          keyword,
          status: "COMPLETED",
        },
        include: {
          files: {
            orderBy: [{ groupIndex: "asc" }, { messageId: "asc" }],
          },
        },
      });
    } catch (error) {
      console.error("Get by keyword error:", error);
      throw error;
    }
  }

  static async getUserUploads(userId, limit = 10) {
    try {
      return await prisma.uploadSession.findMany({
        where: {
          userId: BigInt(userId),
          status: "COMPLETED",
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          files: {
            orderBy: [{ groupIndex: "asc" }, { messageId: "asc" }],
          },
        },
      });
    } catch (error) {
      console.error("Get user uploads error:", error);
      throw error;
    }
  }
}

module.exports = UploadSessionManager;
