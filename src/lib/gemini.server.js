/**
 * Gemini API - Server-side only
 * CRITICAL: Never expose these keys to the client
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// Server-side only - NO NEXT_PUBLIC_ prefix
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const getGeminiModel = (modelName = "gemini-1.5-pro") => {
  return genAI.getGenerativeModel({
    model: modelName,
  });
};

export const getGeminiChat = (modelName = "gemini-1.5-pro") => {
  const model = getGeminiModel(modelName);
  return model.startChat();
};

export default genAI;
