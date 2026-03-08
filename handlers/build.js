const { createProject } = require('../database');
require('dotenv').config();

const PAYMENT_QR_URL = process.env.PAYMENT_QR_URL;
const BUILD_PRICE = parseInt(process.env.BUILD_PRICE);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const buildHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Initialize build state
  global.buildStates[userId] = { 
    step: 'project_name',
    userId: userId,
    chatId: chatId
  };

  console.log(`Build started for user ${userId}`); // Debug log

  await bot.sendMessage(chatId, 
    '📝 *Let\'s build your project!*\n\nPlease enter a name for your project:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [['❌ Cancel']],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }
  );
};

const handleBuildInput = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  console.log(`Build input from ${userId}: ${text}`); // Debug log
  console.log('Current state:', global.buildStates[userId]);

  const state = global.buildStates[userId];
  if (!state) {
    console.log('No state found for user:', userId);
    return;
  }

  switch (state.step) {
    case 'project_name':
      state.projectName = text;
      state.step = 'project_type';
      
      await bot.sendMessage(chatId,
        '📱 *Select Project Type:*\n\nChoose the type of project you want to create:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [
              ['🌐 Website', '📱 Web App'],
              ['🤖 Android App', '🍎 iOS App'],
              ['❌ Cancel']
            ],
            resize_keyboard: true
          }
        }
      );
      break;

    case 'project_type':
      const typeMap = {
        '🌐 Website': 'website',
        '📱 Web App': 'webapp',
        '🤖 Android App': 'android',
        '🍎 iOS App': 'ios'
      };
      
      if (!typeMap[text]) {
        await bot.sendMessage(chatId, '❌ Please select a valid option from the keyboard.');
        return;
      }
      
      state.projectType = typeMap[text];
      state.step = 'description';
      
      await bot.sendMessage(chatId,
        '✍️ *Describe your project:*\n\nTell me what you want to build. Be as detailed as possible:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['❌ Cancel']],
            resize_keyboard: true
          }
        }
      );
      break;

    case 'description':
      state.description = text;
      
      try {
        // Create project in database
        const project = await createProject(userId, state.projectName, state.projectType, state.description);
        
        // Save project ID in state
        state.projectId = project.project_id;
        state.step = 'domain';
        
        await bot.sendMessage(chatId,
          '🌐 *Domain Setup*\n\nDo you want to use a custom domain?',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [
                ['✅ Yes, use custom domain'],
                ['⏩ No, use subdomain'],
                ['❌ Cancel']
              ],
              resize_keyboard: true
            }
          }
        );
      } catch (error) {
        console.error('Error creating project:', error);
        await bot.sendMessage(chatId, '❌ Error creating project. Please try again.');
        delete global.buildStates[userId];
      }
      break;

    case 'domain':
      if (text === '✅ Yes, use custom domain') {
        state.useCustomDomain = true;
        state.step = 'custom_domain';
        await bot.sendMessage(chatId,
          '🔗 *Enter your custom domain:*\n\nExample: mywebsite.com',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['❌ Cancel']],
              resize_keyboard: true
            }
          }
        );
      } else if (text === '⏩ No, use subdomain') {
        state.useCustomDomain = false;
        await processPayment(bot, chatId, userId, state);
      } else {
        await bot.sendMessage(chatId, '❌ Please select a valid option from the keyboard.');
      }
      break;

    case 'custom_domain':
      state.customDomain = text;
      await processPayment(bot, chatId, userId, state);
      break;
  }
};

const processPayment = async (bot, chatId, userId, state) => {
  state.step = 'payment';
  
  const paymentMessage = `
💰 *Payment Required*

To proceed with your project "${state.projectName}", please complete the payment.

💵 *Amount:* ₹${BUILD_PRICE}
📱 *UPI Payment:* Scan the QR code below

📸 *Steps:*
1. Scan the QR code and make payment
2. Take a screenshot of the payment
3. Send the screenshot along with UTR number

⬇️ *QR Code:* [Click here to view](${PAYMENT_QR_URL})

Please send your payment screenshot and UTR number:
  `;

  await bot.sendPhoto(chatId, PAYMENT_QR_URL, {
    caption: paymentMessage,
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [['❌ Cancel']],
      resize_keyboard: true
    }
  });
};

const handlePayment = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const state = global.buildStates[userId];

  console.log(`Payment input from ${userId}`); // Debug log

  if (!state || state.step !== 'payment') {
    console.log('Not in payment state');
    return;
  }

  if (msg.photo) {
    // Get the largest photo
    const photo = msg.photo[msg.photo.length - 1];
    state.screenshotFileId = photo.file_id;
    
    await bot.sendMessage(chatId,
      '📝 Please enter the UTR number from your payment:',
      {
        reply_markup: {
          keyboard: [['❌ Cancel']],
          resize_keyboard: true
        }
      }
    );
  } else if (msg.text && !state.utrNumber) {
    // This is the UTR number
    state.utrNumber = msg.text;
    
    try {
      // Get file URL
      const file = await bot.getFile(state.screenshotFileId);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      
      // Notify admin
      const adminMessage = `
🔔 *New Payment Request*

👤 *User:* ${userId}
📱 *Username:* @${msg.from.username || 'N/A'}
📁 *Project:* ${state.projectName}
💰 *Amount:* ₹${BUILD_PRICE}
📋 *UTR:* ${state.utrNumber}

🖼 *Screenshot:* ${fileUrl}

Project ID: ${state.projectId}
      `;

      await bot.sendMessage(ADMIN_CHAT_ID, adminMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `approve_${state.projectId}` },
              { text: '❌ Reject', callback_data: `reject_${state.projectId}` }
            ]
          ]
        }
      });

      await bot.sendMessage(chatId,
        '✅ *Payment submitted successfully!*\n\nYour payment is pending admin approval. You will be notified once approved.',
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

      // Clear state
      delete global.buildStates[userId];

    } catch (error) {
      console.error('Payment processing error:', error);
      await bot.sendMessage(chatId, '❌ Error processing payment. Please try again.');
    }
  }
};

module.exports = { buildHandler, handleBuildInput, handlePayment };
