const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const express = require('express');

// Database
const { createTables } = require('./database');

// Handlers
const startHandler = require('./handlers/start');
const { buildHandler, handleBuildInput, handlePayment } = require('./handlers/build');
const myBuildsHandler = require('./handlers/mybuilds');
const statisticsHandler = require('./handlers/statistics');
const { supportHandler, handleSupportInput } = require('./handlers/support');
const { handlePaymentApproval, handleDownload } = require('./handlers/payment');

// Global state management
global.buildStates = {};
global.supportStates = {};
global.replyContext = {};

// Initialize bot
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Express server for Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('ClickDev AI Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initialize database
createTables().catch(console.error);

// Command handlers
bot.onText(/\/start/, (msg) => startHandler(bot, msg));

// Message handlers
bot.on('message', async (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  console.log(`Message from ${userId}: ${text}`); // Debug log

  // Skip if it's a command
  if (text && text.startsWith('/')) return;

  try {
    // Check if user is in build state
    if (global.buildStates && global.buildStates[userId]) {
      console.log(`User ${userId} is in build state:`, global.buildStates[userId]);
      
      if (text === '❌ Cancel') {
        delete global.buildStates[userId];
        await bot.sendMessage(chatId, '❌ Build cancelled. Returning to main menu.', {
          reply_markup: {
            keyboard: [
              ['🛠 Build New', '👨‍💻 My Builds'],
              ['📊 Statistics', '🚨 Support']
            ],
            resize_keyboard: true
          }
        });
        return;
      }

      // Handle payment step
      if (global.buildStates[userId].step === 'payment') {
        await handlePayment(bot, msg);
      } else {
        await handleBuildInput(bot, msg);
      }
      return;
    }

    // Check if user is in support state
    if (global.supportStates && global.supportStates[userId]) {
      console.log(`User ${userId} is in support state`);
      
      if (text === '❌ Cancel') {
        delete global.supportStates[userId];
        await bot.sendMessage(chatId, 'Support session cancelled.', {
          reply_markup: {
            keyboard: [
              ['🛠 Build New', '👨‍💻 My Builds'],
              ['📊 Statistics', '🚨 Support']
            ],
            resize_keyboard: true
          }
        });
        return;
      }

      await handleSupportInput(bot, msg);
      return;
    }

    // Handle main menu buttons
    if (text === '🛠 Build New') {
      await buildHandler(bot, msg);
    } else if (text === '👨‍💻 My Builds') {
      await myBuildsHandler(bot, msg);
    } else if (text === '📊 Statistics') {
      await statisticsHandler(bot, msg);
    } else if (text === '🚨 Support') {
      await supportHandler(bot, msg);
    } else if (text === '❌ Cancel') {
      await bot.sendMessage(chatId, 'No active session to cancel.', {
        reply_markup: {
          keyboard: [
            ['🛠 Build New', '👨‍💻 My Builds'],
            ['📊 Statistics', '🚨 Support']
          ],
          resize_keyboard: true
        }
      });
    }
  } catch (error) {
    console.error('Message handler error:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// Callback query handlers
bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  console.log(`Callback from ${userId}: ${data}`); // Debug log

  try {
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
      await handlePaymentApproval(bot, callbackQuery);
    } else if (data.startsWith('download_')) {
      await handleDownload(bot, callbackQuery);
    }
  } catch (error) {
    console.error('Callback handler error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Error processing request' });
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('ClickDev AI Bot is running...');
