import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);

export const getGeminiModel = () => {
  return genAI.getGenerativeModel({ 
    model: "gemini-3-flash-preview", // Nom exact extrait de la doc
  });
};