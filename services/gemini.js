const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateWebsiteCode = async (description, projectType) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    let prompt = '';
    
    if (projectType === 'website' || projectType === 'webapp') {
      prompt = `Create a complete ${projectType} with the following description: "${description}".
      
      Requirements:
      - Generate complete HTML, CSS, and JavaScript code
      - Make it responsive and modern
      - Include all necessary files
      - Use best practices
      - Add comments for clarity
      
      Return the code in a structured format with separate files.`;
    } else if (projectType === 'android') {
      prompt = `Create an Android app (Kotlin/Java) with the following description: "${description}".
      
      Requirements:
      - Generate complete Android app code
      - Include all necessary files (Manifest, Activities, Layouts)
      - Use Material Design
      - Add comments
      
      Return the code in a structured format.`;
    } else if (projectType === 'ios') {
      prompt = `Create an iOS app (Swift) with the following description: "${description}".
      
      Requirements:
      - Generate complete iOS app code
      - Include all necessary files (Swift files, Storyboards)
      - Use SwiftUI or UIKit as appropriate
      - Add comments
      
      Return the code in a structured format.`;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return parseGeneratedCode(text);
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
};

const parseGeneratedCode = (text) => {
  // Parse the generated code into file structure
  const files = {};
  const fileRegex = /```(\w+)\n(.*?)```/gs;
  let match;
  
  while ((match = fileRegex.exec(text)) !== null) {
    const language = match[1];
    const code = match[2];
    
    let filename = '';
    switch(language) {
      case 'html':
        filename = 'index.html';
        break;
      case 'css':
        filename = 'styles.css';
        break;
      case 'javascript':
        filename = 'script.js';
        break;
      case 'kotlin':
        filename = 'MainActivity.kt';
        break;
      case 'java':
        filename = 'MainActivity.java';
        break;
      case 'swift':
        filename = 'ContentView.swift';
        break;
      default:
        filename = `file.${language}`;
    }
    
    files[filename] = code;
  }
  
  return files;
};

module.exports = { generateWebsiteCode };
