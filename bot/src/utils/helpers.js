// src/utils/helpers.js

const generateShareCode = () => {
  return Math.random().toString(36).substring(2, 10);
};

const formatFileSize = (bytes) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const getFileTypeEmoji = (type) => {
  const emojiMap = {
    PHOTO: "📷",
    VIDEO: "🎬",
    DOCUMENT: "📄",
    AUDIO: "🎵",
    VOICE: "🎤",
  };
  return emojiMap[type] || "📎";
};

const groupFilesByType = (files) => {
  const grouped = {};

  for (const file of files) {
    if (!grouped[file.fileType]) {
      grouped[file.fileType] = [];
    }
    grouped[file.fileType].push(file);
  }

  return grouped;
};

const formatFileTypeStats = (files) => {
  const grouped = groupFilesByType(files);
  const stats = [];

  const typeNames = {
    PHOTO: "图片",
    VIDEO: "视频",
    DOCUMENT: "文件",
    AUDIO: "音频",
    VOICE: "语音",
  };

  for (const [type, items] of Object.entries(grouped)) {
    stats.push(
      `${getFileTypeEmoji(type)} ${typeNames[type]} ${items.length}个`
    );
  }

  return stats.join("、");
};

module.exports = {
  generateShareCode,
  formatFileSize,
  getFileTypeEmoji,
  groupFilesByType,
  formatFileTypeStats,
};
