const { createProject, updateProjectDomain, createPayment } = require('../database');
require('dotenv').config();

const PAYMENT_QR_URL = process.env.PAYMENT_QR_URL;
const DOWNLOAD_PRICE = 499;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const buildHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  global.buildStates[userId] = { 
    step: 'project_name',
    userId: userId,
    chatId: chatId
  };

  await bot.sendMessage(chatId, 
    '📝 *Let\'s build your project!*\n\nPlease enter a name for your project:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [['❌ Cancel']],
        resize_keyboard: true
      }
    }
  );
};

const handleBuildInput = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  const state = global.buildStates[userId];
  if (!state) return;

  try {
    switch (state.step) {
      case 'project_name':
        if (!text || text.length < 3) {
          await bot.sendMessage(chatId, '❌ Project name must be at least 3 characters long. Please try again:');
          return;
        }
        state.projectName = text;
        state.step = 'project_type';
        
        await bot.sendMessage(chatId,
          '📱 *Select Project Type:*',
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
          '✍️ *Describe your project:*',
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
        if (!text || text.length < 10) {
          await bot.sendMessage(chatId, '❌ Please provide more details (minimum 10 characters).');
          return;
        }
        
        state.description = text;
        
        // Create project in database
        const project = await createProject(userId, state.projectName, state.projectType, state.description);
        state.projectId = project.project_id;
        
        // Domain selection - FREE
        state.step = 'domain_choice';
        
        await bot.sendMessage(chatId,
          '🌐 *Domain Setup - COMPLETELY FREE*\n\n' +
          'Choose your domain option:\n\n' +
          '1️⃣ *Free Subdomain* (yourname.clickdev-ai.net)\n' +
          '2️⃣ *Custom Domain* (yourown.com)\n\n' +
          '💰 *Note:* ₹499 is only for DOWNLOADING the ZIP file.\n' +
          'Building and domain connection are FREE!\n\n' +
          'Please select 1 or 2:',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [
                ['1️⃣ Free Subdomain'],
                ['2️⃣ Custom Domain'],
                ['❌ Cancel']
              ],
              resize_keyboard: true
            }
          }
        );
        break;

      case 'domain_choice':
        if (text === '1️⃣ Free Subdomain') {
          state.step = 'subdomain_input';
          await bot.sendMessage(chatId,
            '📝 *Enter Subdomain Name*\n\n' +
            'Enter the name for your subdomain (e.g., myproject):',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                keyboard: [['❌ Cancel']],
                resize_keyboard: true
              }
            }
          );
        } else if (text === '2️⃣ Custom Domain') {
          state.step = 'custom_domain_input';
          await bot.sendMessage(chatId,
            '🔗 *Enter Your Custom Domain*\n\n' +
            'Enter your domain name (e.g., example.com):',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                keyboard: [['❌ Cancel']],
                resize_keyboard: true
              }
            }
          );
        } else {
          await bot.sendMessage(chatId, '❌ Please select 1 or 2 from the keyboard.');
        }
        break;

      case 'subdomain_input':
        if (!text || text.length < 3) {
          await bot.sendMessage(chatId, '❌ Subdomain must be at least 3 characters. Try again:');
          return;
        }
        
        const subdomain = `${text.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${userId}.clickdev-ai.net`;
        
        // Save domain to project
        await updateProjectDomain(state.projectId, null, subdomain);
        
        await bot.sendMessage(chatId,
          '✅ *Project Created Successfully!*\n\n' +
          `📁 Project: ${state.projectName}\n` +
          `🌐 Subdomain: *${subdomain}*\n\n` +
          '📌 *What next?*\n' +
          '• View in 👨‍💻 My Builds\n' +
          '• Pay ₹499 to download ZIP\n' +
          '• Update domain anytime FREE\n\n' +
          'Select an option:',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [
                ['👨‍💻 My Builds'],
                ['📁 Request ZIP Download'],
                ['❌ Cancel']
              ],
              resize_keyboard: true
            }
          }
        );
        
        delete global.buildStates[userId];
        break;

      case 'custom_domain_input':
        if (!text.includes('.') || text.length < 4) {
          await bot.sendMessage(chatId, '❌ Invalid domain. Please enter a valid domain (e.g., example.com):');
          return;
        }
        
        const customDomain = text.toLowerCase();
        
        // Save domain to project
        await updateProjectDomain(state.projectId, customDomain, null);
        
        // DNS Instructions
        const dnsInstructions = `
📋 *DNS Configuration Instructions*

To connect *${customDomain}*, add this A record:

📌 *A Record:*
• Type: A
• Name: @
• Value: 75.2.60.5
• TTL: 3600

📌 *CNAME Record (for www):*
• Type: CNAME
• Name: www
• Value: ${state.projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.netlify.app

⏱ *Propagation Time:* 24-48 hours
        `;

        await bot.sendMessage(chatId,
          '✅ *Project Created Successfully!*\n\n' +
          `📁 Project: ${state.projectName}\n` +
          `🌐 Domain: *${customDomain}*\n\n` +
          dnsInstructions +
          '\n\n📌 *What next?*\n' +
          '• View in 👨‍💻 My Builds\n' +
          '• Pay ₹499 to download ZIP\n' +
          '• Update domain anytime FREE',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [
                ['👨‍💻 My Builds'],
                ['📁 Request ZIP Download'],
                ['❌ Cancel']
              ],
              resize_keyboard: true
            }
          }
        );
        
        delete global.buildStates[userId];
        break;
    }
  } catch (error) {
    console.error('Build error:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
};

const requestZipDownload = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const { getUserProjects } = require('../database');
  const projects = await getUserProjects(userId);
  const pendingProject = projects.find(p => p.status === 'pending');

  if (!pendingProject) {
    await bot.sendMessage(chatId,
      '❌ *No pending project found*\n\nCreate a new project with 🛠 Build New',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  global.paymentStates[userId] = {
    step: 'payment',
    projectId: pendingProject.project_id,
    amount: DOWNLOAD_PRICE,
    userId: userId,
    chatId: chatId
  };

  await bot.sendPhoto(chatId, PAYMENT_QR_URL, {
    caption: `💰 *ZIP Download - ₹${DOWNLOAD_PRICE}*\n\n📸 Send payment screenshot:`,
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
  const state = global.paymentStates[userId];

  if (!state) return;

  try {
    // Handle photo (screenshot)
    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      state.screenshotFileId = photo.file_id;
      
      await bot.sendMessage(chatId,
        '📝 *Enter UTR Number*\n\nPaste the UTR number from your payment:',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['❌ Cancel']],
            resize_keyboard: true
          }
        }
      );
      return;
    }

    // Handle UTR text
    if (msg.text && !state.utrNumber && state.screenshotFileId) {
      const utrNumber = msg.text.trim();
      
      if (!utrNumber || utrNumber.length < 6) {
        await bot.sendMessage(chatId, '❌ Invalid UTR. Please enter a valid UTR number:');
        return;
      }

      state.utrNumber = utrNumber;

      // Get file URL
      const file = await bot.getFile(state.screenshotFileId);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

      // Create payment record
      const payment = await createPayment(
        userId,
        state.projectId,
        state.amount,
        state.utrNumber,
        fileUrl
      );

      // Notify admin
      await bot.sendMessage(ADMIN_CHAT_ID,
        `🔔 *New Payment Request*\n\n` +
        `👤 User: ${userId}\n` +
        `📁 Project ID: ${state.projectId}\n` +
        `💰 Amount: ₹${state.amount}\n` +
        `📋 UTR: ${state.utrNumber}\n` +
        `🖼 Screenshot: ${fileUrl}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Approve', callback_data: `approve_${payment.payment_id}_${state.projectId}` },
              { text: '❌ Reject', callback_data: `reject_${payment.payment_id}` }
            ]]
          }
        }
      );

      await bot.sendMessage(chatId,
        '✅ *Payment Submitted!*\n\n' +
        'Admin will verify your payment. You\'ll receive your ZIP file once approved.',
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

      delete global.paymentStates[userId];
    }
  } catch (error) {
    console.error('Payment error:', error);
    
    if (error.message === 'UTR number already used') {
      await bot.sendMessage(chatId, '❌ This UTR has already been used. Please check and try again.');
    } else {
      await bot.sendMessage(chatId, '❌ Error processing payment. Please try again.');
    }
  }
};

module.exports = { 
  buildHandler, 
  handleBuildInput, 
  handlePayment,
  requestZipDownload 
};
