const { createSupportTicket } = require('../database');
require('dotenv').config();

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const supportHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Initialize support state
  global.supportStates[userId] = { 
    active: true,
    userId: userId,
    chatId: chatId
  };

  console.log(`Support started for user ${userId}`); // Debug log

  await bot.sendMessage(chatId,
    '🚨 *Support Center*\n\nPlease describe your issue or question. Our team will respond shortly.\n\nType your message below or click ❌ Cancel to exit:',
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

  console.log(`Support input from ${userId}: ${text}`); // Debug log

  if (!global.supportStates[userId]) {
    console.log('No support state found for user:', userId);
    return;
  }

  try {
    // Create support ticket
    const ticket = await createSupportTicket(userId, text);

    // Notify admin
    const adminMessage = `
🚨 *New Support Ticket*
Ticket ID: ${ticket.ticket_id}

👤 *User:* ${userId}
📱 *Username:* @${msg.from.username || 'N/A'}
📝 *Message:*
${text}

⏰ *Time:* ${new Date().toLocaleString()}
    `;

    await bot.sendMessage(ADMIN_CHAT_ID, adminMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Resolved', callback_data: `resolve_${ticket.ticket_id}` },
            { text: '💬 Reply', callback_data: `reply_${ticket.ticket_id}_${userId}` }
          ]
        ]
      }
    });

    await bot.sendMessage(chatId,
      '✅ *Your support ticket has been submitted!*\n\nWe will get back to you shortly.',
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

    // Clear support state
    delete global.supportStates[userId];

  } catch (error) {
    console.error('Support error:', error);
    await bot.sendMessage(chatId, '❌ Error submitting support ticket. Please try again.');
  }
};

module.exports = { supportHandler, handleSupportInput };
