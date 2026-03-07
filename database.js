const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create tables
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
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_channel_member BOOLEAN DEFAULT FALSE,
        total_builds INTEGER DEFAULT 0,
        wallet_balance INTEGER DEFAULT 0
      )
    `);

    // Projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id SERIAL PRIMARY KEY,
        user_id BIGINT,
        project_name TEXT,
        project_type TEXT,
        description TEXT,
        domain_name TEXT,
        subdomain TEXT,
        github_repo TEXT,
        netlify_url TEXT,
        status TEXT DEFAULT 'pending',
        payment_status BOOLEAN DEFAULT FALSE,
        utr_number TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        zip_file_path TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `);

    // Payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id SERIAL PRIMARY KEY,
        user_id BIGINT,
        project_id INTEGER,
        amount INTEGER,
        utr_number TEXT UNIQUE,
        screenshot_url TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
      )
    `);

    // Support tickets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        ticket_id SERIAL PRIMARY KEY,
        user_id BIGINT,
        message TEXT,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `);

    // Statistics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS statistics (
        id SERIAL PRIMARY KEY,
        total_users INTEGER DEFAULT ${process.env.TOTAL_USERS_START},
        total_deployed INTEGER DEFAULT ${process.env.TOTAL_DEPLOYED_START},
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize statistics if not exists
    const stats = await client.query('SELECT * FROM statistics WHERE id = 1');
    if (stats.rows.length === 0) {
      await client.query('INSERT INTO statistics (id, total_users, total_deployed) VALUES (1, $1, $2)', [
        process.env.TOTAL_USERS_START,
        process.env.TOTAL_DEPLOYED_START
      ]);
    }

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    client.release();
  }
};

// User functions
const createUser = async (userId, username, firstName, lastName) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO users (user_id, username, first_name, last_name) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name
       RETURNING *`,
      [userId, username, firstName, lastName]
    );
    
    // Update total users count
    await client.query('UPDATE statistics SET total_users = total_users + 1 WHERE id = 1');
    
    return result.rows[0];
  } finally {
    client.release();
  }
};

const getUser = async (userId) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    return result.rows[0];
  } finally {
    client.release();
  }
};

const updateChannelMember = async (userId, isMember) => {
  const client = await pool.connect();
  try {
    await client.query('UPDATE users SET is_channel_member = $1 WHERE user_id = $2', [isMember, userId]);
  } finally {
    client.release();
  }
};

// Project functions
const createProject = async (userId, projectName, projectType, description) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO projects (user_id, project_name, project_type, description) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, projectName, projectType, description]
    );
    
    // Update user's total builds
    await client.query('UPDATE users SET total_builds = total_builds + 1 WHERE user_id = $1', [userId]);
    
    return result.rows[0];
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
  } finally {
    client.release();
  }
};

const getProject = async (projectId) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM projects WHERE project_id = $1', [projectId]);
    return result.rows[0];
  } finally {
    client.release();
  }
};

const updateProjectDomain = async (projectId, domain, subdomain) => {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE projects SET domain_name = $1, subdomain = $2, updated_at = CURRENT_TIMESTAMP WHERE project_id = $3',
      [domain, subdomain, projectId]
    );
  } finally {
    client.release();
  }
};

const updateProjectDeployment = async (projectId, githubRepo, netlifyUrl, status) => {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE projects SET github_repo = $1, netlify_url = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE project_id = $4',
      [githubRepo, netlifyUrl, status, projectId]
    );
    
    // Update total deployed count if status is 'deployed'
    if (status === 'deployed') {
      await client.query('UPDATE statistics SET total_deployed = total_deployed + 1 WHERE id = 1');
    }
  } finally {
    client.release();
  }
};

const updateProjectZipPath = async (projectId, zipPath) => {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE projects SET zip_file_path = $1, updated_at = CURRENT_TIMESTAMP WHERE project_id = $2',
      [zipPath, projectId]
    );
  } finally {
    client.release();
  }
};

// Payment functions
const createPayment = async (userId, projectId, amount, utrNumber, screenshotUrl) => {
  const client = await pool.connect();
  try {
    // Check if UTR already exists
    const existing = await client.query('SELECT * FROM payments WHERE utr_number = $1', [utrNumber]);
    if (existing.rows.length > 0) {
      throw new Error('UTR number already used');
    }

    const result = await client.query(
      `INSERT INTO payments (user_id, project_id, amount, utr_number, screenshot_url) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, projectId, amount, utrNumber, screenshotUrl]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
};

const approvePayment = async (paymentId, projectId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query(
      'UPDATE payments SET status = $1, approved_at = CURRENT_TIMESTAMP WHERE payment_id = $2',
      ['approved', paymentId]
    );
    
    await client.query(
      'UPDATE projects SET payment_status = TRUE, status = $1 WHERE project_id = $2',
      ['payment_approved', projectId]
    );
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Support functions
const createSupportTicket = async (userId, message) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO support_tickets (user_id, message) VALUES ($1, $2) RETURNING *',
      [userId, message]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
};

const closeSupportTicket = async (ticketId) => {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE support_tickets SET status = $1, closed_at = CURRENT_TIMESTAMP WHERE ticket_id = $2',
      ['closed', ticketId]
    );
  } finally {
    client.release();
  }
};

// Statistics functions
const getStatistics = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM statistics WHERE id = 1');
    const actualUsers = await client.query('SELECT COUNT(*) FROM users');
    
    return {
      total_users: result.rows[0].total_users + parseInt(actualUsers.rows[0].count),
      total_deployed: result.rows[0].total_deployed
    };
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  createTables,
  createUser,
  getUser,
  updateChannelMember,
  createProject,
  getUserProjects,
  getProject,
  updateProjectDomain,
  updateProjectDeployment,
  updateProjectZipPath,
  createPayment,
  approvePayment,
  createSupportTicket,
  closeSupportTicket,
  getStatistics
};
