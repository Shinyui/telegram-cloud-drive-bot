// src/handlers/download.js
const UploadSessionManager = require("../managers/upload-session.js");
const { InlineKeyboard } = require("grammy");
const { formatFileSize } = require("../utils/helpers.js");

const registerDownloadHandlers = (bot) => {
  // 點擊「獲取文件」按鈕
  bot.callbackQuery("download_start", async (ctx) => {
    await ctx.answerCallbackQuery();

    await ctx.editMessageText(
      "📥 获取文件\n\n" +
        "请输入分享码或关键词直接获取：\n" +
        "（例如：c5ceab74 或 关键词）",
      {
        reply_markup: new InlineKeyboard().text("🔙 返回主选单", "main_menu"),
      }
    );

    // 設置用戶狀態為等待輸入分享碼 (這裡簡單處理，監聽文字訊息)
    // 注意：實際生產環境建議使用 session 或 finite state machine 來管理狀態
  });

  // 監聽文字訊息作為分享碼/關鍵字輸入
  bot.on("message:text", async (ctx, next) => {
    // 如果是命令，交給下一個中間件處理
    if (ctx.message.text.startsWith("/")) {
      return next();
    }

    // 簡單判斷：如果不是在設置標題的狀態（這裡假設只有這兩種文字輸入場景）
    // 為了更嚴謹，應該引入 session 狀態管理，這裡先做通用處理

    const input = ctx.message.text.trim();
    if (input.length < 3) return next(); // 太短可能不是分享碼

    try {
      // 1. 嘗試用分享碼搜尋
      let session = await UploadSessionManager.getByShareCode(input);

      // 2. 如果沒找到，嘗試用關鍵字搜尋
      if (!session) {
        session = await UploadSessionManager.getByKeyword(input);
      }

      if (session) {
        await sendFiles(ctx, session, bot);
        return; // 成功處理，結束
      }
    } catch (error) {
      console.error("Auto search error:", error);
    }

    // 如果沒找到或者是普通聊天，交給下一個處理（比如設置標題）
    return next();
  });

  // 使用分享碼或關鍵字獲取
  bot.command("get", async (ctx) => {
    const input = ctx.match?.trim();

    if (!input) {
      return ctx.reply(
        "❌ 请提供分享码或关键词\n\n" +
          "用法：/get <分享码/关键词>\n" +
          "例如：/get c5ceab74 或 /get 关键词"
      );
    }

    console.log("Getting files with input:", input);

    try {
      // 1. 嘗試用分享碼搜尋
      let session = await UploadSessionManager.getByShareCode(input);

      // 2. 如果沒找到，嘗試用關鍵字搜尋
      if (!session) {
        console.log("Not found by share code, trying keyword...");
        session = await UploadSessionManager.getByKeyword(input);
      }

      if (!session) {
        return ctx.reply(
          `❌ 找不到「${input}」对应的分享（无效的分享码或关键词）`
        );
      }

      console.log(
        "Found session:",
        session.id,
        "with",
        session.totalFiles,
        "files"
      );

      await sendFiles(ctx, session, bot);
    } catch (error) {
      console.error("Get command error:", error);
      await ctx.reply("❌ 获取文件失败，请稍后再试");
    }
  });

  // 使用關鍵字獲取
  bot.command("keyword", async (ctx) => {
    const keyword = ctx.match?.trim();

    if (!keyword) {
      return ctx.reply(
        "❌ 请提供关键词\n\n" +
          "用法：/keyword <关键词>\n" +
          "例如：/keyword xxx"
      );
    }

    console.log("Getting files with keyword:", keyword);

    try {
      const session = await UploadSessionManager.getByKeyword(keyword);

      if (!session) {
        return ctx.reply(`❌ 找不到关键词「${keyword}」对应的分享`);
      }

      console.log(
        "Found session:",
        session.id,
        "with",
        session.totalFiles,
        "files"
      );

      await sendFiles(ctx, session, bot);
    } catch (error) {
      console.error("Keyword command error:", error);
      await ctx.reply("❌ 获取文件失败，请稍后再试");
    }
  });
};

// 發送文件的核心函數
const sendFiles = async (ctx, session, bot) => {
  const isOwner = session.userId === BigInt(ctx.from.id);
  const effectivePrevent = isOwner ? session.preventForward : true;

  console.log("Starting to send files for session:", session.id);
  console.log("Total files:", session.totalFiles);
  console.log("Files array length:", session.files?.length);

  // 發送概要訊息
  const summaryMsg = await ctx.reply(
    `📦 ${session.title}\n\n` +
      `📊 共 ${session.totalFiles} 个文件\n` +
      `💾 总大小：${formatFileSize(Number(session.totalSize))}\n` +
      `${session.keyword ? `🔍 关键词：${session.keyword}\n` : ""}` +
      `🔒 转发限制：${effectivePrevent ? "已启用" : "未启用"}\n\n` +
      `⏳ 正在发送文件...`
  );

  if (!session.files || session.files.length === 0) {
    await ctx.api.editMessageText(
      ctx.chat.id,
      summaryMsg.message_id,
      `📦 ${session.title}\n\n❌ 没有找到文件`
    );
    return;
  }

  try {
    // 按組分類文件
    const filesByGroup = {};
    for (const file of session.files) {
      const groupIndex = file.groupIndex || 0;
      if (!filesByGroup[groupIndex]) {
        filesByGroup[groupIndex] = [];
      }
      filesByGroup[groupIndex].push(file);
    }

    console.log("Files grouped by index:", Object.keys(filesByGroup));

    const groupIndexes = Object.keys(filesByGroup)
      .map(Number)
      .sort((a, b) => a - b);

    let sentCount = 0;
    let failedCount = 0;

    for (const groupIndex of groupIndexes) {
      const files = filesByGroup[groupIndex];

      console.log(`Sending group ${groupIndex} with ${files.length} files`);

      // 如果有多組，顯示組標題
      if (groupIndexes.length > 1) {
        await ctx.reply(`📁 第 ${groupIndex + 1} 组文件：`);
      }

      const isAlbumCapable = (f) =>
        f.fileType === "PHOTO" || f.fileType === "VIDEO";

      let i = 0;
      while (i < files.length) {
        const f = files[i];

        if (!isAlbumCapable(f) || !f.mediaGroupId) {
          try {
            const options = {
              caption: f.caption || undefined,
              protect_content: effectivePrevent,
            };
            switch (f.fileType) {
              case "DOCUMENT":
                await ctx.replyWithDocument(f.telegramFileId, options);
                break;
              case "AUDIO":
                await ctx.replyWithAudio(f.telegramFileId, options);
                break;
              case "VOICE":
                await ctx.replyWithVoice(f.telegramFileId, options);
                break;
              case "PHOTO":
                await ctx.replyWithPhoto(f.telegramFileId, options);
                break;
              case "VIDEO":
                await ctx.replyWithVideo(f.telegramFileId, options);
                break;
              default:
                await ctx.replyWithDocument(f.telegramFileId, options);
            }
            sentCount++;
          } catch (error) {
            console.error(`Failed to send file ${f.fileName}:`, error);
            failedCount++;
            await ctx.reply(`❌ ${f.fileName || "文件"} 发送失败`);
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
          i++;
          continue;
        }

        const currentGroupId = f.mediaGroupId;
        const run = [];
        while (
          i < files.length &&
          isAlbumCapable(files[i]) &&
          files[i].mediaGroupId === currentGroupId
        ) {
          run.push(files[i]);
          i++;
        }

        if (run.length >= 2) {
          for (let j = 0; j < run.length; j += 10) {
            const chunk = run.slice(j, j + 10);
            const media = chunk.map((mf) =>
              mf.fileType === "PHOTO"
                ? {
                    type: "photo",
                    media: mf.telegramFileId,
                    caption: mf.caption || undefined,
                  }
                : {
                    type: "video",
                    media: mf.telegramFileId,
                    caption: mf.caption || undefined,
                  }
            );
            try {
              await ctx.api.sendMediaGroup(ctx.chat.id, media, {
                protect_content: effectivePrevent,
              });
              sentCount += chunk.length;
            } catch (error) {
              for (const mf of chunk) {
                try {
                  const options = {
                    caption: mf.caption || undefined,
                    protect_content: effectivePrevent,
                  };
                  if (mf.fileType === "PHOTO") {
                    await ctx.replyWithPhoto(mf.telegramFileId, options);
                  } else {
                    await ctx.replyWithVideo(mf.telegramFileId, options);
                  }
                  sentCount++;
                } catch (err) {
                  console.error(
                    `Failed to send individual media item ${mf.fileName}:`,
                    err
                  );
                  failedCount++;
                  await ctx.reply(`❌ ${mf.fileName || "文件"} 发送失败`);
                }
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        } else {
          const single = run[0];
          if (single) {
            try {
              const options = {
                caption: single.caption || undefined,
                protect_content: effectivePrevent,
              };
              if (single.fileType === "PHOTO") {
                await ctx.replyWithPhoto(single.telegramFileId, options);
              } else {
                await ctx.replyWithVideo(single.telegramFileId, options);
              }
              sentCount++;
            } catch (error) {
              console.error(
                `Failed to send single media item ${single.fileName}:`,
                error
              );
              failedCount++;
              await ctx.reply(`❌ ${single.fileName || "文件"} 发送失败`);
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      }
    }

    // 更新概要訊息
    await ctx.api.editMessageText(
      ctx.chat.id,
      summaryMsg.message_id,
      `📦 ${session.title}\n\n` +
        `📊 共 ${session.totalFiles} 个文件\n` +
        `💾 总大小：${formatFileSize(Number(session.totalSize))}\n` +
        `${session.keyword ? `🔍 关键词：${session.keyword}\n` : ""}` +
        `🔒 转发限制：${effectivePrevent ? "已启用" : "未启用"}\n\n` +
        `✅ 发送完成！\n` +
        `📤 成功：${sentCount}\n` +
        `${failedCount > 0 ? `❌ 失败：${failedCount}` : ""}`
    );

    console.log(
      `File sending completed. Success: ${sentCount}, Failed: ${failedCount}`
    );
  } catch (error) {
    console.error("Error in sendFiles:", error);
    await ctx.reply("❌ 发送文件时出错");
  }
};

module.exports = registerDownloadHandlers;
