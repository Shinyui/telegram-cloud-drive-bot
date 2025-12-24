// src/utils/keyboards.js
const { InlineKeyboard } = require("grammy");

const mainMenuKeyboard = () => {
  return new InlineKeyboard()
    .text("📤 开始存储", "upload_start")
    .row()
    .text("📥 获取文件", "download_start")
    .row()
    .text("📋 我的存储", "my_uploads");
};

const uploadCollectingKeyboard = () => {
  return new InlineKeyboard()
    .text("✅ 完成存储", "upload_complete")
    .row()
    .text("❌ 取消", "upload_cancel");
};

const uploadCancelKeyboard = () => {
  return new InlineKeyboard().text("❌ 取消", "upload_cancel");
};

module.exports = {
  mainMenuKeyboard,
  uploadCollectingKeyboard,
  uploadCancelKeyboard,
};
