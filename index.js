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
const { supportHandler, handleSupportInput, resolveTicket } = require('./handlers/support');
const { handlePaymentApproval, handleDownload } = require('./handlers/payment');

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

  // Skip if it's a command
  if (text && text.startsWith('/')) return;

  // Check if user is in any state
  const userId = msg.from.id;
  
  // Handle different states
  if (text === '🛠 Build New') {
    await buildHandler(bot, msg);
  } else if (text === '👨‍💻 My Builds') {
    await myBuildsHandler(bot, msg);
  } else if (text === '📊 Statistics') {
    await statisticsHandler(bot, msg);
  } else if (text === '🚨 Support') {
    await supportHandler(bot, msg);
  } else if (text === '❌ Cancel') {
    // Handle cancel in different states
    if (global.buildStates && global.buildStates[userId]) {
      delete global.buildStates[userId];
    }
    if (global.supportStates && global.supportStates[userId]) {
      delete global.supportStates[userId];
    }
    
    await bot.sendMessage(chatId, 'Operation cancelled.', {
      reply_markup: {
        keyboard: [
          ['🛠 Build New', '👨‍💻 My Builds'],
          ['📊 Statistics', '🚨 Support']
        ],
        resize_keyboard: true
      }
    });
  } else {
    // Handle input for different states
    if (global.buildStates && global.buildStates[userId]) {
      if (global.buildStates[userId].step === 'payment') {
        await handlePayment(bot, msg);
      } else {
        await handleBuildInput(bot, msg);
      }
    } else if (global.supportStates && global.supportStates[userId]) {
      await handleSupportInput(bot, msg);
    }
  }
});

// Callback query handlers
bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;

  if (data.startsWith('approve_') || data.startsWith('reject_')) {
    await handlePaymentApproval(bot, callbackQuery);
  } else if (data.startsWith('download_')) {
    await handleDownload(bot, callbackQuery);
  } else if (data.startsWith('resolve_')) {
    const ticketId = data.split('_')[1];
    const result = await resolveTicket(bot, ticketId);
    
    if (result.success) {
      await bot.editMessageText(
        '✅ *Ticket Resolved*\n\nThis support ticket has been marked as resolved.',
        {
          chat_id: callbackQuery.message.chat.id,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'Markdown'
        }
      );
    }
    
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: result.success ? 'Ticket resolved' : 'Error resolving ticket'
    });
  } else if (data.startsWith('reply_')) {
    const [_, ticketId, userId] = data.split('_');
    
    await bot.sendMessage(callbackQuery.from.id,
      `💬 *Reply to User*\n\nPlease type your reply to user ${userId}:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true
        }
      }
    );
    
    // Store context for reply
    global.replyContext = {
      ticketId,
      userId,
      adminId: callbackQuery.from.id
    };
    
    await bot.answerCallbackQuery(callbackQuery.id);
  }
});

// Handle replies from admin
bot.on('message', async (msg) => {
  if (msg.reply_to_message && global.replyContext) {
    const { userId, ticketId } = global.replyContext;
    const reply = msg.text;
    
    if (reply && reply !== '❌ Cancel') {
      await bot.sendMessage(userId, 
        `📨 *Support Reply*\n\n${reply}\n\n- ClickDev AI Support Team`,
        { parse_mode: 'Markdown' }
      );
      
      await bot.sendMessage(msg.chat.id, '✅ Reply sent to user.');
      
      delete global.replyContext;
    }
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

bot.on('webhook_error', (error) => {
  console.error('Webhook error:', error);
});

console.log('ClickDev AI Bot is running...');
