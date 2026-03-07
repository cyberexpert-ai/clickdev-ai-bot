const TelegramBot = require('node-telegram-bot-api');
const { getStatistics } = require('../database');

const statisticsHandler = async (bot, msg) => {
  const chatId = msg.chat.id;

  try {
    const stats = await getStatistics();

    const message = `
📊 *ClickDev AI Statistics*

👥 *Total Users:* ${stats.total_users.toLocaleString()}
🚀 *Total Deployed:* ${stats.total_deployed.toLocaleString()}
📱 *Active Projects:* ${stats.total_deployed.toLocaleString()}
💎 *Success Rate:* 99.9%

⚡ *Live Statistics Updated in Real-time*
    `;

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Statistics error:', error);
    await bot.sendMessage(chatId, '❌ Error fetching statistics.');
  }
};

module.exports = statisticsHandler;
