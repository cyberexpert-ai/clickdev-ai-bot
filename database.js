const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ============================================
// CREATE TABLES FUNCTION
// ============================================
const createTables = async () => {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id BIGINT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        phone_number TEXT,
        language_code TEXT DEFAULT 'en',
        is_channel_member BOOLEAN DEFAULT FALSE,
        total_builds INTEGER DEFAULT 0,
        wallet_balance INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_blocked BOOLEAN DEFAULT FALSE,
        notes TEXT
      )
    `);

    // Projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        project_name TEXT NOT NULL,
        project_type TEXT NOT NULL,
        description TEXT,
        domain_name TEXT,
        subdomain TEXT,
        github_repo TEXT,
        github_repo_url TEXT,
        netlify_site_id TEXT,
        netlify_url TEXT,
        custom_domain TEXT,
        status TEXT DEFAULT 'pending',
        payment_status BOOLEAN DEFAULT FALSE,
        utr_number TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deployed_at TIMESTAMP,
        zip_file_path TEXT,
        zip_file_size BIGINT,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )
    `);

    // Payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        project_id INTEGER,
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'INR',
        utr_number TEXT UNIQUE NOT NULL,
        screenshot_url TEXT,
        payment_method TEXT DEFAULT 'upi',
        status TEXT DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP,
        rejected_at TIMESTAMP,
        approved_by BIGINT,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL
      )
    `);

    // Support tickets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        ticket_id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        ticket_number TEXT UNIQUE,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP,
        closed_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )
    `);

    // Statistics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS statistics (
        id SERIAL PRIMARY KEY,
        total_users BIGINT DEFAULT 2965680,
        total_deployed BIGINT DEFAULT 59954377,
        total_projects BIGINT DEFAULT 0,
        total_payments BIGINT DEFAULT 0,
        total_revenue BIGINT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize statistics if not exists
    const stats = await client.query('SELECT * FROM statistics WHERE id = 1');
    if (stats.rows.length === 0) {
      await client.query(
        'INSERT INTO statistics (id, total_users, total_deployed) VALUES (1, $1, $2)',
        [process.env.TOTAL_USERS_START || 2965680, process.env.TOTAL_DEPLOYED_START || 59954377]
      );
    }

    // Insert admin user if not exists
    await client.query(`
      INSERT INTO users (user_id, username, first_name, is_channel_member) 
      VALUES ($1, 'admin', 'Admin', true)
      ON CONFLICT (user_id) DO NOTHING
    `, [process.env.ADMIN_CHAT_ID || 8004114088]);

    console.log('✅ Database tables created successfully');
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// USER FUNCTIONS
// ============================================

const createUser = async (userId, username, firstName, lastName) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO users (user_id, username, first_name, last_name, last_active) 
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) 
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         last_active = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, username, firstName, lastName]
    );
    
    // Check if this is a new user (insert, not update)
    if (result.rows[0].created_at === result.rows[0].updated_at) {
      await client.query('UPDATE statistics SET total_users = total_users + 1 WHERE id = 1');
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getUser = async (userId) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    return result.rows[0];
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  } finally {
    client.release();
  }
};

const updateUserLastActive = async (userId) => {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE user_id = $1',
      [userId]
    );
  } catch (error) {
    console.error('Error updating user last active:', error);
    throw error;
  } finally {
    client.release();
  }
};

const updateChannelMember = async (userId, isMember) => {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE users SET is_channel_member = $1 WHERE user_id = $2',
      [isMember, userId]
    );
  } catch (error) {
    console.error('Error updating channel member:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getAllUsers = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows;
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// PROJECT FUNCTIONS
// ============================================

const createProject = async (userId, projectName, projectType, description) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO projects (user_id, project_name, project_type, description, status) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [userId, projectName, projectType, description, 'pending']
    );
    
    // Update user's total builds
    await client.query(
      'UPDATE users SET total_builds = total_builds + 1 WHERE user_id = $1',
      [userId]
    );
    
    await client.query('UPDATE statistics SET total_projects = total_projects + 1 WHERE id = 1');
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getUserProjects = async (userId) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting user projects:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getProject = async (projectId) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM projects WHERE project_id = $1',
      [projectId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error getting project:', error);
    throw error;
  } finally {
    client.release();
  }
};

const updateProjectDomain = async (projectId, domainName, subdomain) => {
  const client = await pool.connect();
  try {
    if (domainName) {
      await client.query(
        'UPDATE projects SET domain_name = $1, subdomain = NULL, updated_at = CURRENT_TIMESTAMP WHERE project_id = $2',
        [domainName, projectId]
      );
    } else if (subdomain) {
      await client.query(
        'UPDATE projects SET subdomain = $1, domain_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE project_id = $2',
        [subdomain, projectId]
      );
    }
    return true;
  } catch (error) {
    console.error('Error updating project domain:', error);
    throw error;
  } finally {
    client.release();
  }
};

const updateProjectDeployment = async (projectId, githubRepo, netlifyUrl, status) => {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE projects 
       SET github_repo = $1, 
           github_repo_url = $1,
           netlify_url = $2, 
           status = $3, 
           deployed_at = CASE WHEN $3 = 'deployed' THEN CURRENT_TIMESTAMP ELSE deployed_at END,
           updated_at = CURRENT_TIMESTAMP 
       WHERE project_id = $4`,
      [githubRepo, netlifyUrl, status, projectId]
    );
    
    // Update total deployed count if status is 'deployed'
    if (status === 'deployed') {
      await client.query('UPDATE statistics SET total_deployed = total_deployed + 1 WHERE id = 1');
    }
  } catch (error) {
    console.error('Error updating project deployment:', error);
    throw error;
  } finally {
    client.release();
  }
};

const updateProjectZipPath = async (projectId, zipPath) => {
  const client = await pool.connect();
  try {
    const fs = require('fs-extra');
    let fileSize = 0;
    
    if (await fs.pathExists(zipPath)) {
      const stats = await fs.stat(zipPath);
      fileSize = stats.size;
    }
    
    await client.query(
      'UPDATE projects SET zip_file_path = $1, zip_file_size = $2, updated_at = CURRENT_TIMESTAMP WHERE project_id = $3',
      [zipPath, fileSize, projectId]
    );
  } catch (error) {
    console.error('Error updating project zip path:', error);
    throw error;
  } finally {
    client.release();
  }
};

const updateProjectPaymentStatus = async (projectId, utrNumber) => {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE projects SET payment_status = TRUE, utr_number = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE project_id = $3',
      [utrNumber, 'payment_approved', projectId]
    );
  } catch (error) {
    console.error('Error updating project payment status:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getAllProjects = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM projects ORDER BY created_at DESC'
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all projects:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// PAYMENT FUNCTIONS
// ============================================

const createPayment = async (userId, projectId, amount, utrNumber, screenshotUrl) => {
  const client = await pool.connect();
  try {
    // Check if UTR already exists
    const existing = await client.query('SELECT * FROM payments WHERE utr_number = $1', [utrNumber]);
    if (existing.rows.length > 0) {
      throw new Error('UTR number already used');
    }

    const result = await client.query(
      `INSERT INTO payments (user_id, project_id, amount, utr_number, screenshot_url, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [userId, projectId, amount, utrNumber, screenshotUrl, 'pending']
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating payment:', error);
    throw error;
  } finally {
    client.release();
  }
};

const approvePayment = async (paymentId, projectId, adminId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Update payment
    await client.query(
      'UPDATE payments SET status = $1, approved_at = CURRENT_TIMESTAMP, approved_by = $2 WHERE payment_id = $3',
      ['approved', adminId, paymentId]
    );
    
    // Update project
    await client.query(
      'UPDATE projects SET payment_status = TRUE, status = $1, updated_at = CURRENT_TIMESTAMP WHERE project_id = $2',
      ['payment_approved', projectId]
    );
    
    // Update statistics
    const payment = await client.query('SELECT amount FROM payments WHERE payment_id = $1', [paymentId]);
    await client.query(
      'UPDATE statistics SET total_payments = total_payments + 1, total_revenue = total_revenue + $1 WHERE id = 1',
      [payment.rows[0].amount]
    );
    
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error approving payment:', error);
    throw error;
  } finally {
    client.release();
  }
};

const rejectPayment = async (paymentId, adminId, reason) => {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE payments SET status = $1, rejected_at = CURRENT_TIMESTAMP, approved_by = $2, admin_notes = $3 WHERE payment_id = $4',
      ['rejected', adminId, reason, paymentId]
    );
    return true;
  } catch (error) {
    console.error('Error rejecting payment:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getPaymentByUtr = async (utrNumber) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM payments WHERE utr_number = $1', [utrNumber]);
    return result.rows[0];
  } catch (error) {
    console.error('Error getting payment by UTR:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getUserPayments = async (userId) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting user payments:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// SUPPORT TICKET FUNCTIONS
// ============================================

const createSupportTicket = async (userId, message) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO support_tickets (user_id, message, status) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [userId, message, 'open']
    );
    
    // Generate ticket number
    const ticket = result.rows[0];
    const ticketNumber = `TKT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(ticket.ticket_id).padStart(6, '0')}`;
    
    await client.query(
      'UPDATE support_tickets SET ticket_number = $1 WHERE ticket_id = $2',
      [ticketNumber, ticket.ticket_id]
    );
    
    ticket.ticket_number = ticketNumber;
    return ticket;
  } catch (error) {
    console.error('Error creating support ticket:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getSupportTicket = async (ticketId) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM support_tickets WHERE ticket_id = $1',
      [ticketId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error getting support ticket:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getUserTickets = async (userId) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting user tickets:', error);
    throw error;
  } finally {
    client.release();
  }
};

const updateTicketStatus = async (ticketId, status) => {
  const client = await pool.connect();
  try {
    let query = 'UPDATE support_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP';
    const params = [status];
    
    if (status === 'resolved') {
      query += ', resolved_at = CURRENT_TIMESTAMP';
    } else if (status === 'closed') {
      query += ', closed_at = CURRENT_TIMESTAMP';
    }
    
    query += ' WHERE ticket_id = $' + (params.length + 1);
    params.push(ticketId);
    
    await client.query(query, params);
    return true;
  } catch (error) {
    console.error('Error updating ticket status:', error);
    throw error;
  } finally {
    client.release();
  }
};

const resolveTicket = async (ticketId) => {
  return updateTicketStatus(ticketId, 'resolved');
};

const closeTicket = async (ticketId) => {
  return updateTicketStatus(ticketId, 'closed');
};

// ============================================
// STATISTICS FUNCTIONS
// ============================================

const getStatistics = async () => {
  const client = await pool.connect();
  try {
    // Get base stats
    const statsResult = await client.query('SELECT * FROM statistics WHERE id = 1');
    
    // Get actual user count
    const usersResult = await client.query('SELECT COUNT(*) FROM users');
    
    // Get today's active users
    const todayActive = await client.query(
      "SELECT COUNT(*) FROM users WHERE DATE(last_active) = CURRENT_DATE"
    );
    
    // Get this week's active users
    const weekActive = await client.query(
      "SELECT COUNT(*) FROM users WHERE last_active >= CURRENT_DATE - INTERVAL '7 days'"
    );
    
    // Get pending payments
    const pendingPayments = await client.query(
      "SELECT COUNT(*) FROM payments WHERE status = 'pending'"
    );
    
    // Get open tickets
    const openTickets = await client.query(
      "SELECT COUNT(*) FROM support_tickets WHERE status = 'open'"
    );
    
    const stats = statsResult.rows[0] || {
      total_users: parseInt(process.env.TOTAL_USERS_START) || 2965680,
      total_deployed: parseInt(process.env.TOTAL_DEPLOYED_START) || 59954377
    };
    
    return {
      total_users: stats.total_users + parseInt(usersResult.rows[0].count),
      total_deployed: stats.total_deployed,
      total_projects: stats.total_projects || 0,
      total_payments: stats.total_payments || 0,
      total_revenue: stats.total_revenue || 0,
      active_today: parseInt(todayActive.rows[0].count),
      active_week: parseInt(weekActive.rows[0].count),
      pending_payments: parseInt(pendingPayments.rows[0].count),
      open_tickets: parseInt(openTickets.rows[0].count)
    };
  } catch (error) {
    console.error('Error getting statistics:', error);
    throw error;
  } finally {
    client.release();
  }
};

const incrementDeployedCount = async () => {
  const client = await pool.connect();
  try {
    await client.query('UPDATE statistics SET total_deployed = total_deployed + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
  } catch (error) {
    console.error('Error incrementing deployed count:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// DOMAIN REQUEST FUNCTIONS
// ============================================

const createDomainRequest = async (userId, projectId, domainName) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO domain_requests (user_id, project_id, domain_name, amount, status) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [userId, projectId, domainName, parseInt(process.env.DOMAIN_CHANGE_PRICE) || 99, 'pending']
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating domain request:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// CLEANUP FUNCTIONS
// ============================================

const cleanupOldSessions = async () => {
  const client = await pool.connect();
  try {
    // This is a placeholder for session cleanup if you implement sessions table
    console.log('Running cleanup...');
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    client.release();
  }
};

// ============================================
// EXPORT ALL FUNCTIONS
// ============================================

module.exports = {
  // Connection pool
  pool,
  
  // Table creation
  createTables,
  
  // User functions
  createUser,
  getUser,
  updateUserLastActive,
  updateChannelMember,
  getAllUsers,
  
  // Project functions
  createProject,
  getUserProjects,
  getProject,
  updateProjectDomain,
  updateProjectDeployment,
  updateProjectZipPath,
  updateProjectPaymentStatus,
  getAllProjects,
  
  // Payment functions
  createPayment,
  approvePayment,
  rejectPayment,
  getPaymentByUtr,
  getUserPayments,
  
  // Support ticket functions
  createSupportTicket,
  getSupportTicket,
  getUserTickets,
  updateTicketStatus,
  resolveTicket,
  closeTicket,
  
  // Statistics functions
  getStatistics,
  incrementDeployedCount,
  
  // Domain request functions
  createDomainRequest,
  
  // Cleanup functions
  cleanupOldSessions
};
