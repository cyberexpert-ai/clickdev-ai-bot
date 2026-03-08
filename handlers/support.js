const { createSupportTicket, getSupportTicket, updateTicketStatus } = require('../database');
require('dotenv').config();

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const supportHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  global.supportStates[userId] = { active: true };

  await bot.sendMessage(chatId,
    '🚨 *Support Center*\n\nDescribe your issue:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [['❌ Cancel']],
        resize_keyboard: true
      }
    }
  );
};

const handleSupportInput = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (!global.supportStates[userId]) return;

  try {
    const ticket = await createSupportTicket(userId, text);

    // Notify admin
    await bot.sendMessage(ADMIN_CHAT_ID,
      `🚨 *New Support Ticket #${ticket.ticket_id}*\n\n` +
      `👤 User: ${userId}\n` +
      `📝 Message: ${text}\n` +
      `⏰ Time: ${new Date().toLocaleString()}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Resolve', callback_data: `resolve_${ticket.ticket_id}` },
            { text: '💬 Reply', callback_data: `reply_${ticket.ticket_id}_${userId}` }
          ]]
        }
      }
    );

    // Confirm to user
    await bot.sendMessage(chatId,
      '✅ *Ticket Submitted!*\n\nWe\'ll respond soon.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            ['🛠 Build New', '👨‍💻 My Builds'],
            ['📊 Statistics', '🚨 Support']
          ],
          resize_keyboard: true
        }
      }
    );

    delete global.supportStates[userId];

  } catch (error) {
    console.error('Support error:', error);
    await bot.sendMessage(chatId, '❌ Error submitting ticket.');
  }
};

const handleAdminSupportActions = async (bot, callbackQuery) => {
  const data = callbackQuery.data;
  const message = callbackQuery.message;
  const adminId = callbackQuery.from.id;

  // Verify admin
  if (adminId.toString() !== ADMIN_CHAT_ID) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Unauthorized!' });
    return;
  }

  try {
    if (data.startsWith('resolve_')) {
      const ticketId = parseInt(data.split('_')[1]);
      
      // Update ticket status
      await updateTicketStatus(ticketId, 'resolved');
      
      // Get ticket info
      const ticket = await getSupportTicket(ticketId);
      
      // Notify user
      if (ticket) {
        await bot.sendMessage(ticket.user_id,
          '✅ *Ticket Resolved*\n\nYour support ticket has been resolved. If you have more issues, please create a new ticket.',
          { parse_mode: 'Markdown' }
        );
      }
      
      // Update admin message
      await bot.editMessageText(
        `✅ *Ticket Resolved*\n\nTicket #${ticketId} has been marked as resolved.`,
        {
          chat_id: message.chat.id,
          message_id: message.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Resolved' });
      
    } else if (data.startsWith('reply_')) {
      const parts = data.split('_');
      const ticketId = parseInt(parts[1]);
      const userId = parseInt(parts[2]);
      
      // Store context for reply
      global.replyContext = {
        ticketId: ticketId,
        userId: userId,
        adminId: adminId
      };
      
      await bot.sendMessage(ADMIN_CHAT_ID,
        `💬 *Reply to User*\n\nType your reply below:`,
        {
          parse_mode: 'Markdown',
          reply_markup: { force_reply: true }
        }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id);
    }
  } catch (error) {
    console.error('Admin action error:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error' });
  }
};

const handleAdminReply = async (bot, msg) => {
  if (msg.reply_to_message && global.replyContext) {
    const { userId, ticketId } = global.replyContext;
    const reply = msg.text;
    
    if (reply && reply !== '❌ Cancel') {
      try {
        // Send reply to user
        await bot.sendMessage(userId,
          `📨 *Support Reply*\n\n${reply}\n\n- ClickDev AI Support Team`,
          { parse_mode: 'Markdown' }
        );
        
        // Confirm to admin
        await bot.sendMessage(msg.chat.id, 
          '✅ Reply sent to user.',
          { parse_mode: 'Markdown' }
        );
        
        // Clear context
        delete global.replyContext;
      } catch (error) {
        console.error('Admin reply error:', error);
        await bot.sendMessage(msg.chat.id, '❌ Failed to send reply.');
      }
    }
  }
};

module.exports = { 
  supportHandler, 
  handleSupportInput, 
  handleAdminSupportActions,
  handleAdminReply 
};
