const axios = require('axios');
const { simpleGit } = require('simple-git');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const GITHUB_API = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;

const createGitHubRepo = async (repoName, files) => {
  try {
    // Create repository
    const repoResponse = await axios.post(
      `${GITHUB_API}/user/repos`,
      {
        name: repoName,
        description: 'Created with ClickDev AI',
        private: false,
        auto_init: false
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const repoUrl = repoResponse.data.clone_url;
    const repoHtmlUrl = repoResponse.data.html_url;

    // Create temporary directory
    const tempDir = path.join(__dirname, '../../temp', repoName);
    await fs.ensureDir(tempDir);

    // Write files
    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(tempDir, filename);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, content);
    }

    // Initialize git and push
    const git = simpleGit(tempDir);
    await git.init();
    await git.add('.');
    await git.commit('Initial commit from ClickDev AI');
    
    // Add remote and push
    await git.addRemote('origin', repoUrl);
    await git.push(`https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${repoName}.git`, 'main');

    // Clean up
    await fs.remove(tempDir);

    return {
      success: true,
      url: repoHtmlUrl,
      cloneUrl: repoUrl
    };
  } catch (error) {
    console.error('GitHub repo creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = { createGitHubRepo };
