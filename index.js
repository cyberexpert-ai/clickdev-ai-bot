const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const express = require('express');

// Database
const { createTables } = require('./database');

// Handlers
const startHandler = require('./handlers/start');
const { buildHandler, handleBuildInput, handlePayment, requestZipDownload } = require('./handlers/build');
const { myBuildsHandler, handleUpdateDomain, handleDomainUpdateInput } = require('./handlers/mybuilds');
const statisticsHandler = require('./handlers/statistics');
const { supportHandler, handleSupportInput, handleAdminSupportActions } = require('./handlers/support');
const { handlePaymentApproval, handleDownload } = require('./handlers/payment');

// Reminder service
const { sendChannelReminders, checkLeftMembers } = require('./services/reminder');

// Global state management
global.buildStates = {};
global.supportStates = {};
global.paymentStates = {};
global.domainUpdateStates = {};
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
  console.log(`✅ Server running on port ${PORT}`);
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

  console.log(`📩 Message from ${userId}: ${text}`);

  // Skip if it's a command
  if (text && text.startsWith('/')) return;

  try {
    // Check if user is in build state
    if (global.buildStates && global.buildStates[userId]) {
      if (text === '❌ Cancel') {
        delete global.buildStates[userId];
        await bot.sendMessage(chatId, '❌ Build cancelled.', {
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
      await handleBuildInput(bot, msg);
      return;
    }

    // Check if user is in payment state
    if (global.paymentStates && global.paymentStates[userId]) {
      if (text === '❌ Cancel') {
        delete global.paymentStates[userId];
        await bot.sendMessage(chatId, '❌ Payment cancelled.', {
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
      await handlePayment(bot, msg);
      return;
    }

    // Check if user is in support state
    if (global.supportStates && global.supportStates[userId]) {
      if (text === '❌ Cancel') {
        delete global.supportStates[userId];
        await bot.sendMessage(chatId, '❌ Support cancelled.', {
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

    // Check if user is in domain update state
    if (global.domainUpdateStates && global.domainUpdateStates[userId]) {
      if (text === '❌ Cancel') {
        delete global.domainUpdateStates[userId];
        await bot.sendMessage(chatId, '❌ Domain update cancelled.', {
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
      await handleDomainUpdateInput(bot, msg);
      return;
    }

    // Handle main menu buttons
    switch(text) {
      case '🛠 Build New':
        await buildHandler(bot, msg);
        break;
      case '👨‍💻 My Builds':
        await myBuildsHandler(bot, msg);
        break;
      case '📊 Statistics':
        await statisticsHandler(bot, msg);
        break;
      case '🚨 Support':
        await supportHandler(bot, msg);
        break;
      case '📁 Request ZIP Download':
        await requestZipDownload(bot, msg);
        break;
      default:
        // Ignore unknown messages
        break;
    }
  } catch (error) {
    console.error('❌ Message handler error:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// Callback query handlers
bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  console.log(`🔄 Callback from ${userId}: ${data}`);

  try {
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
      await handlePaymentApproval(bot, callbackQuery);
    } 
    else if (data.startsWith('download_')) {
      await handleDownload(bot, callbackQuery);
    }
    else if (data.startsWith('pay_')) {
      const projectId = data.split('_')[1];
      global.paymentStates = global.paymentStates || {};
      global.paymentStates[userId] = {
        step: 'payment',
        projectId: projectId,
        amount: 499,
        userId: userId,
        chatId: callbackQuery.message.chat.id
      };
      
      await bot.sendMessage(callbackQuery.message.chat.id,
        '💰 *ZIP Download Payment*\n\n' +
        'Please send your payment screenshot:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['❌ Cancel']],
            resize_keyboard: true
          }
        }
      );
      await bot.answerCallbackQuery(callbackQuery.id);
    }
    else if (data.startsWith('updatedomain_')) {
      await handleUpdateDomain(bot, callbackQuery);
    }
    else if (data.startsWith('resolve_') || data.startsWith('reply_') || data.startsWith('close_')) {
      await handleAdminSupportActions(bot, callbackQuery);
    }
  } catch (error) {
    console.error('❌ Callback handler error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error processing request' });
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('⚠️ Polling error:', error);
});

// Start reminders
setInterval(() => {
  sendChannelReminders(bot).catch(console.error);
  checkLeftMembers(bot).catch(console.error);
}, 24 * 60 * 60 * 1000);

setTimeout(() => {
  sendChannelReminders(bot).catch(console.error);
  checkLeftMembers(bot).catch(console.error);
}, 5 * 60 * 1000);

console.log('🚀 ClickDev AI Bot is running!');
