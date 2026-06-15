const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const callGemini = async (prompt) => {
  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const text = response.data.candidates[0].content.parts[0].text;
    return text;

  } catch (error) {
    console.log('Gemini API error: ' + (error.response ? JSON.stringify(error.response.data) : error.message));
    return null;
  }
};

const generateSafetyMessage = async (alertType, details, language) => {
  const prompt = language === 'hindi'
    ? `You are a helpful assistant for elderly Indian users. 
       An alert has been detected: ${alertType}
       Details: ${details}
       Generate a simple, clear, and caring warning message in Hindi (Devanagari script) 
       for the elderly person. Keep it under 2 sentences. 
       Also suggest what they should do. Be gentle and respectful.`
    : `You are a helpful assistant for elderly users.
       An alert has been detected: ${alertType}
       Details: ${details}
       Generate a simple, clear, and caring warning message in English
       for the elderly person. Keep it under 2 sentences.
       Also suggest what they should do. Be gentle and respectful.`;

  return await callGemini(prompt);
};

const analyzeFraudRisk = async (transactionDetails) => {
  const prompt = `You are a fraud detection expert for Indian digital payments.
  Analyze this transaction and respond with ONLY a JSON object like this:
  {"riskLevel": "high/medium/low", "reason": "brief reason", "recommendation": "what to do"}
  
  Transaction details: ${JSON.stringify(transactionDetails)}
  
  Consider these as high risk: unknown recipients, unusual amounts, odd timing, 
  pressure to pay quickly, requests from strangers.`;

  const text = await callGemini(prompt);
  if (!text) return null;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return null;
};

const generateHindiGuidance = async (task) => {
  const prompt = `You are a patient and helpful assistant for elderly Indian users who struggle with smartphones.
  Task they need help with: ${task}
  
  Generate simple step-by-step guidance in Hindi (Devanagari script).
  Use very simple language that elderly people can understand.
  Maximum 4 steps. Number each step.
  Be encouraging and gentle.`;

  return await callGemini(prompt);
};

module.exports = {
  generateSafetyMessage,
  analyzeFraudRisk,
  generateHindiGuidance
};