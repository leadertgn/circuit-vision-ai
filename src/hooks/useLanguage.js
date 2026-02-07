/**
 * Hook for automatic browser language detection
 * Uses localStorage for persistence and navigator.language as fallback
 * Supports: English (en), French (fr), Spanish (es), German (de), Portuguese (pt), Chinese (zh)
 */

import { useState, useEffect } from "react";

export function useLanguage() {
  const [language, setLanguage] = useState("en");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Supported languages
    const supportedLangs = ["en", "fr", "es", "de", "pt", "zh"];
    let detectedLang = "en";

    // 1. Check localStorage first (for user preference)
    if (typeof window !== "undefined") {
      const storedLang = localStorage.getItem("circuitvision_lang");
      if (storedLang && supportedLangs.includes(storedLang)) {
        detectedLang = storedLang;
      }
    }

    // 2. Check URL param (?lang=fr)
    if (detectedLang === "en" && typeof window !== "undefined" && window.location.search) {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get("lang");
      if (urlLang && supportedLangs.includes(urlLang)) {
        detectedLang = urlLang;
        // Save to localStorage
        localStorage.setItem("circuitvision_lang", urlLang);
      }
    }

    // 3. Fallback to navigator.language
    if (detectedLang === "en") {
      const navLang = navigator.language?.split("-")[0].toLowerCase();
      if (navLang && supportedLangs.includes(navLang)) {
        detectedLang = navLang;
      }
    }

    setLanguage(detectedLang);
    setIsLoading(false);
  }, []);

  return { language, isLoading };
}

/**
 * Change language and save to localStorage
 */
export function changeLanguage(newLang) {
  if (typeof window !== "undefined") {
    localStorage.setItem("circuitvision_lang", newLang);

    // Optional: Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set("lang", newLang);
    window.history.replaceState({}, "", url);

    // Trigger a re-render by dispatching event
    window.dispatchEvent(new Event("languagechange"));
  }
}

/**
 * Get language display name
 */
export function getLanguageName(langCode) {
  const names = {
    en: "English",
    fr: "Français",
    es: "Español",
    de: "Deutsch",
    pt: "Português",
    zh: "中文",
  };
  return names[langCode] || "English";
}

/**
 * Get language flag
 */
export function getLanguageFlag(langCode) {
  const flags = {
    en: "🇺🇸 🇬🇧",
    fr: "🇫🇷",
    es: "🇪🇸",
    de: "🇩🇪",
    pt: "🇧🇷",
    zh: "🇨🇳",
  };
  return flags[langCode] || "🇺🇸";
}
