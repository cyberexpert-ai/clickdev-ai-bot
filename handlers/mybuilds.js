const { getUserProjects, getProject, updateProjectDomain } = require('../database');
const fs = require('fs-extra');

const myBuildsHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const projects = await getUserProjects(userId);

    if (projects.length === 0) {
      await bot.sendMessage(chatId,
        '📭 *No Projects Found*\n\nStart with 🛠 Build New!',
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
      return;
    }

    for (const project of projects) {
      const statusEmoji = {
        'pending': '⏳',
        'payment_approved': '💰',
        'processing': '⚙️',
        'deployed': '✅',
        'failed': '❌'
      };

      const domainInfo = project.domain_name 
        ? `🔗 *Custom Domain:* ${project.domain_name}`
        : project.subdomain 
          ? `🆓 *Subdomain:* ${project.subdomain}`
          : '🌐 *Domain:* Not configured';

      const message = `
${statusEmoji[project.status] || '📁'} *${project.project_name}*

📱 Type: ${project.project_type}
📊 Status: ${project.status}
${domainInfo}
📅 Created: ${new Date(project.created_at).toLocaleDateString()}
${project.netlify_url ? `\n🌐 Live: ${project.netlify_url}` : ''}
      `;

      const buttons = [];
      
      // Download button - only if payment approved and zip exists
      if (project.status === 'payment_approved' && project.zip_file_path) {
        if (await fs.pathExists(project.zip_file_path)) {
          buttons.push([{ text: '📁 Download ZIP', callback_data: `download_${project.project_id}` }]);
        }
      }
      
      // Pay button - if pending
      if (project.status === 'pending') {
        buttons.push([{ text: '💰 Pay ₹499 for ZIP', callback_data: `pay_${project.project_id}` }]);
      }
      
      // Update domain button - ALWAYS AVAILABLE and FREE
      buttons.push([{ text: '🌐 Update Domain (Free)', callback_data: `updatedomain_${project.project_id}` }]);

      if (buttons.length > 0) {
        await bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });
      } else {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      }
    }
  } catch (error) {
    console.error('My builds error:', error);
    await bot.sendMessage(chatId, '❌ Error fetching projects.');
  }
};

const handleUpdateDomain = async (bot, callbackQuery) => {
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const chatId = callbackQuery.message.chat.id;
  const projectId = parseInt(data.split('_')[1]);

  global.domainUpdateStates[userId] = {
    step: 'domain_choice',
    projectId: projectId
  };

  await bot.sendMessage(chatId,
    '🌐 *Update Domain - FREE*\n\n' +
    'Choose option:\n\n' +
    '1️⃣ Free Subdomain\n' +
    '2️⃣ Custom Domain\n\n' +
    'Select 1 or 2:',
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

  await bot.answerCallbackQuery(callbackQuery.id);
};

const handleDomainUpdateInput = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  const state = global.domainUpdateStates[userId];
  if (!state) return;

  try {
    const project = await getProject(state.projectId);
    if (!project) {
      await bot.sendMessage(chatId, '❌ Project not found.');
      delete global.domainUpdateStates[userId];
      return;
    }

    switch (state.step) {
      case 'domain_choice':
        if (text === '1️⃣ Free Subdomain') {
          state.step = 'subdomain_input';
          await bot.sendMessage(chatId,
            '📝 *Enter Subdomain Name*\n\n(e.g., myproject):',
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
            '🔗 *Enter Custom Domain*\n\n(e.g., example.com):',
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
        await updateProjectDomain(state.projectId, null, subdomain);
        
        await bot.sendMessage(chatId,
          '✅ *Subdomain Updated!*\n\n' +
          `New subdomain: *${subdomain}*`,
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
        
        delete global.domainUpdateStates[userId];
        break;

      case 'custom_domain_input':
        if (!text.includes('.') || text.length < 4) {
          await bot.sendMessage(chatId, '❌ Invalid domain. Please enter a valid domain (e.g., example.com):');
          return;
        }
        
        const customDomain = text.toLowerCase();
        await updateProjectDomain(state.projectId, customDomain, null);
        
        await bot.sendMessage(chatId,
          '✅ *Domain Updated!*\n\n' +
          `New domain: *${customDomain}*\n\n` +
          '📋 *DNS Setup:*\n' +
          'Add this A record:\n' +
          'Type: A\n' +
          'Name: @\n' +
          'Value: 75.2.60.5',
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
        
        delete global.domainUpdateStates[userId];
        break;
    }
  } catch (error) {
    console.error('Domain update error:', error);
    await bot.sendMessage(chatId, '❌ Error updating domain.');
  }
};

module.exports = { 
  myBuildsHandler, 
  handleUpdateDomain,
  handleDomainUpdateInput 
};
