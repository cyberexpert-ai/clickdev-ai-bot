const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const NETLIFY_API = 'https://api.netlify.com/api/v1';
const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;

const deployToNetlify = async (siteName, files) => {
  try {
    // Create site
    const siteResponse = await axios.post(
      `${NETLIFY_API}/sites`,
      {
        name: siteName,
        custom_domain: null
      },
      {
        headers: {
          Authorization: `Bearer ${NETLIFY_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const siteId = siteResponse.data.id;
    const siteUrl = siteResponse.data.url;

    // Prepare files for deployment
    const formData = new FormData();
    
    for (const [filename, content] of Object.entries(files)) {
      formData.append('files', Buffer.from(content), {
        filename: filename,
        contentType: 'text/plain'
      });
    }

    // Deploy files
    await axios.post(
      `${NETLIFY_API}/sites/${siteId}/deploys`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${NETLIFY_TOKEN}`
        }
      }
    );

    return {
      success: true,
      url: siteUrl,
      siteId: siteId
    };
  } catch (error) {
    console.error('Netlify deployment error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const updateCustomDomain = async (siteId, domain) => {
  try {
    await axios.patch(
      `${NETLIFY_API}/sites/${siteId}`,
      {
        custom_domain: domain
      },
      {
        headers: {
          Authorization: `Bearer ${NETLIFY_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return { success: true };
  } catch (error) {
    console.error('Domain update error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = { deployToNetlify, updateCustomDomain };
