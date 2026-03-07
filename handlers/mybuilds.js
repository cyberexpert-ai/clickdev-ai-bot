const TelegramBot = require('node-telegram-bot-api');
const { getUserProjects } = require('../database');

const myBuildsHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const projects = await getUserProjects(userId);

    if (projects.length === 0) {
      await bot.sendMessage(chatId,
        '📭 *No projects found*\n\nStart building your first project with 🛠 Build New!',
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
        'deployed': '✅',
        'failed': '❌'
      };

      const message = `
${statusEmoji[project.status] || '📁'} *${project.project_name}*

📱 *Type:* ${project.project_type}
📝 *Description:* ${project.description.substring(0, 100)}${project.description.length > 100 ? '...' : ''}
🌐 *Domain:* ${project.domain_name || 'Not set'}
🔗 *Subdomain:* ${project.subdomain || 'Not set'}
📅 *Created:* ${new Date(project.created_at).toLocaleDateString()}
📊 *Status:* ${project.status}

${project.netlify_url ? `🔗 *Live URL:* ${project.netlify_url}` : ''}
${project.github_repo ? `📦 *GitHub:* ${project.github_repo}` : ''}
      `;

      const buttons = [];
      
      if (project.status === 'deployed') {
        buttons.push([
          { text: '📁 Download ZIP', callback_data: `download_${project.project_id}` },
          { text: '🛠 Update', callback_data: `update_${project.project_id}` }
        ]);
      }

      await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined
      });
    }

  } catch (error) {
    console.error('My builds error:', error);
    await bot.sendMessage(chatId, '❌ Error fetching your projects.');
  }
};

module.exports = myBuildsHandler;
