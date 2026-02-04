/**
 * ⚠️ DEPRECATED - Use src/lib/gemini.server.js instead
 * This file is kept for backward compatibility only.
 *
 * IMPORTANT: Never use NEXT_PUBLIC_GEMINI_API_KEY in production!
 * API keys with NEXT_PUBLIC_ prefix are exposed to the client.
 */

// This file is deprecated. Use gemini.server.js for server-side operations only.

export const getGeminiModel = () => {
  console.warn("⚠️ gemini.js is deprecated. Use gemini.server.js instead.");
  return null;
};

export default {
  getGeminiModel,
};
