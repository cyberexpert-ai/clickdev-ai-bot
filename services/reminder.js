const { pool } = require('../database');

const checkChannelMembership = async (bot, userId) => {
  try {
    const chatMember = await bot.getChatMember(process.env.CHANNEL_ID, userId);
    return ['member', 'administrator', 'creator'].includes(chatMember.status);
  } catch (error) {
    console.log(`Channel check error for user ${userId}:`, error.message);
    return false;
  }
};

const sendChannelReminders = async (bot) => {
  const client = await pool.connect();
  try {
    // Get users who haven't joined the channel
    const result = await client.query(
      "SELECT user_id FROM users WHERE is_channel_member = false"
    );
    
    console.log(`Sending reminders to ${result.rows.length} users...`);
    
    for (const row of result.rows) {
      const userId = row.user_id;
      
      try {
        // Check current membership
        const isMember = await checkChannelMembership(bot, userId);
        
        if (!isMember) {
          // Send reminder
          await bot.sendMessage(userId,
            '📢 *Join Our Channel!*\n\n' +
            'Get updates, tips, and exclusive offers:\n\n' +
            '👉 [ClickDeveloper Channel](https://t.me/clickdeveloper)\n\n' +
            '_This is optional - you can continue using the bot without joining._',
            {
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }
          );
        } else {
          // Update membership status
          await client.query(
            'UPDATE users SET is_channel_member = true WHERE user_id = $1',
            [userId]
          );
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.log(`Error processing user ${userId}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Reminder error:', error);
  } finally {
    client.release();
  }
};

const checkLeftMembers = async (bot) => {
  const client = await pool.connect();
  try {
    // Get users who were previously members
    const result = await client.query(
      "SELECT user_id FROM users WHERE is_channel_member = true"
    );
    
    console.log(`Checking ${result.rows.length} members who left...`);
    
    for (const row of result.rows) {
      const userId = row.user_id;
      
      try {
        // Check if they're still a member
        const isMember = await checkChannelMembership(bot, userId);
        
        if (!isMember) {
          // They left the channel
          await client.query(
            'UPDATE users SET is_channel_member = false WHERE user_id = $1',
            [userId]
          );
          
          // Send reminder to rejoin
          await bot.sendMessage(userId,
            '👋 *Miss You in Our Channel!*\n\n' +
            'We noticed you left our official channel.\n\n' +
            '🌟 *Come back for:*\n' +
            '• Latest updates\n' +
            '• New features\n' +
            '• Community support\n\n' +
            '👉 [Rejoin now](https://t.me/clickdeveloper)',
            {
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }
          );
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.log(`Error checking user ${userId}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Left members check error:', error);
  } finally {
    client.release();
  }
};

module.exports = {
  sendChannelReminders,
  checkLeftMembers
};
