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

const generateFraudExplanation = async (evidence) => {
  const prompt = `You are explaining a fraud-risk result for a family caring for an elderly Indian user.
The application has already calculated the risk score and risk level. Do NOT change the risk level and do NOT invent new signals.
Explain the supplied evidence in simple, calm English in 1-3 sentences. Mention the strongest reasons only.

Evidence: ${JSON.stringify(evidence)}
`;

  return await callGemini(prompt);
};

// Backward-compatible name. It is now explanation-only; it no longer asks
// Gemini to make the application's fraud decision.
const analyzeFraudRisk = async (transactionDetails) => generateFraudExplanation(transactionDetails);

const parseFraudAnalysisText = (text) => {
  if (!text) return null;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
};


const parseTransactionSmsWithGemini = async (rawMessage) => {
  const prompt = `Extract transaction information from this bank SMS. Respond with ONLY JSON:
{\"amount\":number,\"recipient\":string,\"transactionType\":\"debit|credit|transfer|unknown\",\"time\":\"HH:MM or null\",\"date\":\"DD/MM/YYYY or null\"}
Do not invent missing values. Use null when a value is not present.
SMS: ${rawMessage}`;

  const text = await callGemini(prompt);
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.amount !== 'number' || !Number.isFinite(parsed.amount) || parsed.amount <= 0) return null;
    if (typeof parsed.recipient !== 'string' || parsed.recipient.trim().length === 0) return null;
    if (!['debit', 'credit', 'transfer', 'unknown'].includes(parsed.transactionType)) return null;
    return {
      amount: parsed.amount,
      recipient: parsed.recipient.trim(),
      transactionType: parsed.transactionType,
      time: typeof parsed.time === 'string' ? parsed.time : null,
      date: typeof parsed.date === 'string' ? parsed.date : null,
    };
  } catch {
    return null;
  }
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
  callGemini,
  generateSafetyMessage,
  analyzeFraudRisk,
  generateFraudExplanation,
  parseTransactionSmsWithGemini,
  parseFraudAnalysisText,
  generateHindiGuidance
};