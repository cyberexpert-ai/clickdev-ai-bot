
const TelegramBot = require('node-telegram-bot-api');
const { createUser, getUser, updateChannelMember } = require('../database');
require('dotenv').config();

const CHANNEL_ID = process.env.CHANNEL_ID;

const startHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  const firstName = msg.from.first_name;
  const lastName = msg.from.last_name;

  try {
    // Create or update user
    await createUser(userId, username, firstName, lastName);

    // Check channel membership
    let isMember = false;
    try {
      const chatMember = await bot.getChatMember(CHANNEL_ID, userId);
      isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
      await updateChannelMember(userId, isMember);
    } catch (error) {
      console.log('Channel check error:', error.message);
    }

    // Welcome message
    const welcomeMessage = `
🌟 *Welcome to ClickDev AI!* 🌟

Your ultimate AI-powered development assistant. Create websites, web apps, Android apps, and iOS apps with ease!

📱 *What I can do for you:*
• Generate complete website code
• Create Android & iOS apps
• Deploy to Netlify automatically
• Provide downloadable ZIP files
• Custom domain support

🚀 *Get Started:*
Click on 🛠 Build New to create your first project!

Select an option below:
    `;

    const keyboard = {
      reply_markup: {
        keyboard: [
          ['🛠 Build New', '👨‍💻 My Builds'],
          ['📊 Statistics', '🚨 Support']
        ],
        resize_keyboard: true
      }
    };

    await bot.sendMessage(chatId, welcomeMessage, { 
      parse_mode: 'Markdown',
      ...keyboard 
    });

  } catch (error) {
    console.error('Start handler error:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
};

module.exports = startHandler;
