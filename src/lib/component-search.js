/**
 * Component Search - Recherche automatique de composants avec prix et liens d'achat
 * Utilise Google Search de Gemini 3 pour trouver les meilleurs prix
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// Server-side Gemini instance
const genAI =
  typeof window === "undefined" ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

/**
 * Extrait les composants du code source
 */
export function extractComponentsFromCode(code) {
  const components = new Set();

  // Patterns de composants connus
  const componentPatterns = [
    // Sensors
    { regex: /DHT22|DHT11/gi, component: "DHT22" },
    { regex: /BMP280|BMP180/gi, component: "BMP280" },
    { regex: /BME280/gi, component: "BME280" },
    { regex: /MPU6050|MPU9250/gi, component: "MPU6050" },
    { regex: /HC-SR04/gi, component: "HC-SR04" },
    { regex: /MQ-\d+/gi, component: "MQ-2" },

    // Displays
    { regex: /SSD1306|OLED/gi, component: "OLED SSD1306" },
    { regex: /LCD.*16.*2|1602/gi, component: "LCD 16x2" },
    { regex: /TFT|ILI9341/gi, component: "TFT Display" },

    // Communication
    { regex: /ESP32/gi, component: "ESP32" },
    { regex: /ESP8266/gi, component: "ESP8266" },
    { regex: /nRF24L01/gi, component: "nRF24L01" },
    { regex: /HC-05|HC-06/gi, component: "HC-05 Bluetooth" },

    // Motors
    { regex: /Servo/gi, component: "Servo Motor" },
    { regex: /Stepper|28BYJ/gi, component: "Stepper Motor 28BYJ-48" },
    { regex: /L298N/gi, component: "L298N Motor Driver" },

    // Storage
    { regex: /SD Card|SD_MMC/gi, component: "SD Card Module" },

    // Power
    { regex: /LM2596|Buck/gi, component: "LM2596 Buck Converter" },
    { regex: /AMS1117|LDO/gi, component: "AMS1117 3.3V Regulator" },

    // Others
    { regex: /Relay/gi, component: "Relay Module" },
    { regex: /LED Strip|WS2812|NeoPixel/gi, component: "WS2812 LED Strip" },
    { regex: /RC522|MFRC522/gi, component: "RFID RC522" },
    { regex: / ultrasonic/i, component: "HC-SR04 Ultrasonic" },
  ];

  componentPatterns.forEach((pattern) => {
    if (pattern.regex.test(code)) {
      components.add(pattern.component);
    }
  });

  return Array.from(components);
}

/**
 * Compte les occurrences pour estimer la quantité
 */
export function estimateQuantity(code, component) {
  const escapedComponent = component.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedComponent, "gi");
  const matches = code.match(regex);
  return matches ? Math.min(matches.length, 5) : 1;
}

/**
 * FONCTION PRINCIPALE - Recherche les prix avec Google Search via Gemini 3
 * Cette fonction utilise l'outil Google Search de Gemini 3
 */
export async function searchComponentPrices(components, language = "en") {
  if (!components || components.length === 0) {
    return { success: false, items: [], error: "No components provided" };
  }

  // Vérifier que Gemini est disponible (côté serveur uniquement)
  if (!genAI) {
    console.warn("⚠️ Gemini not available (client-side), using fallback prices");
    return getFallbackPrices(components);
  }

  try {
    console.log(`🔍 Searching prices for ${components.length} components...`);

    // Modèle Gemini avec Google Search activé
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [{ googleSearch: {} }], // 🆕 Outil Google Search activé
    });

    const prompt =
      language === "fr" ? getFrenchSearchPrompt(components) : getEnglishSearchPrompt(components);

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log("✅ Google Search completed");

    // Parser la réponse JSON
    const shoppingItems = parseShoppingResponse(responseText, components);

    return {
      success: true,
      items: shoppingItems,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Google Search error:", error.message);
    return getFallbackPrices(components);
  }
}

/**
 * Prompt de recherche en anglais
 */
function getEnglishSearchPrompt(components) {
  return `
🛒 SHOPPING LIST - Electronic Components with Real Prices

For each of these components, search Google and find current prices:

${components.map((c, i) => `${i + 1}. ${c}`).join("\n")}

For EACH component, provide in JSON format:
{
  "component": "Name",
  "price_usd": "X.XX (average price)",
  "vendors": [
    {"name": "Amazon", "price": "X.XX", "url": "https://amazon.com/..."},
    {"name": "Mouser", "price": "X.XX", "url": "https://mouser.com/..."},
    {"name": "AliExpress", "price": "X.XX", "url": "https://aliexpress.com/..."}
  ],
  "alternatives": ["Alt1", "Alt2"]
}

Respond ONLY with valid JSON, no additional text. Example:
[
  {"component": "ESP32", "price_usd": "6.99", "vendors": [{"name": "Amazon", "price": "6.99", "url": "https://amazon.com/dp/B08..."}], "alternatives": ["ESP32-S2"]}
]
`;
}

/**
 * Prompt de recherche en français
 */
function getFrenchSearchPrompt(components) {
  return `
🛒 LISTE DE COURSES - Composants Électroniques avec Prix Réels

Pour chacun de ces composants, fais une recherche Google et trouve les prix actuels :

${components.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Pour CHAQUE composant, fournis en format JSON :
{
  "component": "Nom",
  "price_usd": "X.XX (prix moyen)",
  "vendors": [
    {"name": "Amazon", "price": "X.XX", "url": "https://amazon.fr/..."},
    {"name": "Mouser", "price": "X.XX", "url": "https://mouser.com/..."},
    {"name": "AliExpress", "price": "X.XX", "url": "https://aliexpress.com/..."}
  ],
  "alternatives": ["Alt1", "Alt2"]
}

Réponds UNIQUEMENT avec du JSON valide, sans texte supplémentaire.
`;
}

/**
 * Parse la réponse de Gemini pour extraire les informations d'achat
 */
function parseShoppingResponse(responseText, originalComponents) {
  try {
    // Extraire le JSON de la réponse
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const items = JSON.parse(jsonMatch[0]);

    // Normaliser les données
    return items.map((item) => ({
      component: item.component || "Unknown",
      price_usd: item.price_usd || "Check manually",
      vendors: (item.vendors || []).slice(0, 3),
      alternatives: item.alternatives || getDefaultAlternatives(item.component),
    }));
  } catch (error) {
    console.warn("⚠️ Failed to parse shopping response, using fallback");
    return getFallbackPrices(originalComponents);
  }
}

/**
 * Prix de fallback si Google Search échoue
 */
function getFallbackPrices(components) {
  const fallbackPrices = {
    ESP32: { price: "6.99", vendors: ["Amazon", "AliExpress"] },
    DHT22: { price: "4.99", vendors: ["Amazon", "AliExpress"] },
    "OLED SSD1306": { price: "5.99", vendors: ["Amazon", "AliExpress"] },
    "HC-SR04": { price: "3.99", vendors: ["Amazon", "AliExpress"] },
    "Servo Motor": { price: "4.99", vendors: ["Amazon", "AliExpress"] },
    BMP280: { price: "4.49", vendors: ["Amazon", "AliExpress"] },
    MPU6050: { price: "5.99", vendors: ["Amazon", "AliExpress"] },
    L298N: { price: "7.99", vendors: ["Amazon", "AliExpress"] },
    nRF24L01: { price: "3.49", vendors: ["Amazon", "AliExpress"] },
    "RFID RC522": { price: "6.99", vendors: ["Amazon", "AliExpress"] },
  };

  return components.map((comp) => {
    const fallback = fallbackPrices[comp] || { price: "Check manually", vendors: [] };
    return {
      component: comp,
      price_usd: fallback.price,
      vendors: fallback.vendors.map((name) => ({
        name,
        price: fallback.price,
        url: `https://www.google.com/search?q=${encodeURIComponent(comp + " " + name)}`,
      })),
      alternatives: getDefaultAlternatives(comp),
    };
  });
}

/**
 * Alternatives par défaut pour chaque composant
 */
function getDefaultAlternatives(component) {
  const alternatives = {
    DHT22: ["DHT11 (less accurate)", "AM2302", "SHT31"],
    ESP32: ["ESP32-WROOM", "ESP32-S2", "ESP32-C3"],
    BMP280: ["BMP180", "BME280 (with humidity)"],
    MPU6050: ["MPU9250 (with magnetometer)", "MPU6500"],
    "OLED SSD1306": ["SSD1309", "SH1106"],
    "Servo Motor": ["SG90", "MG90S (metal)", "MG996R (powerful)"],
    L298N: ["DRV8833", "TB6612", "L293D"],
    "HC-SR04": ["US-015 (better accuracy)", "JSN-SR04T (waterproof)"],
    "RFID RC522": ["PN532", "RC522 V2.0"],
    ESP8266: ["ESP-01", "NodeMCU", "Wemos D1 Mini"],
  };
  return alternatives[component] || [];
}

/**
 * Génère un tableau markdown de la shopping list
 */
export function generateShoppingMarkdown(items, language = "en") {
  if (!items || items.length === 0) {
    return "";
  }

  const title = language === "fr" ? "## 🛒 Liste de Courses" : "## 🛒 Shopping List";
  const componentHeader = language === "fr" ? "Composant" : "Component";
  const priceHeader = language === "fr" ? "Prix (USD)" : "Price (USD)";
  const linksHeader = language === "fr" ? "Liens" : "Links";
  const altsHeader = language === "fr" ? "Alternatives" : "Alternatives";

  let markdown = `${title}\n\n`;
  markdown += `| ${componentHeader} | ${priceHeader} | ${linksHeader} | ${altsHeader} |\n`;
  markdown += `|-----------|-------------|-------------|-------------|\n`;

  let totalPrice = 0;

  items.forEach((item) => {
    const price = parseFloat(item.price_usd);
    if (!isNaN(price)) {
      totalPrice += price;
    }

    const links =
      item.vendors
        ?.slice(0, 2)
        .map((v) => `[${v.name}](${v.url})`)
        .join(" • ") || "🔍 Search";

    const alts = item.alternatives?.slice(0, 2).join(", ") || "-";

    markdown += `| ${item.component} | $${item.price_usd} | ${links} | ${alts} |\n`;
  });

  markdown += `\n> 💡 ${
    language === "fr"
      ? "Prix indicatifs - vérifiez la disponibilité et les frais de port"
      : "Indicative prices - check availability and shipping costs"
  }\n`;

  return markdown;
}

/**
 * FONCTION PRINCIPALE - Génère la shopping list complète
 */
export async function generateShoppingList(codeSource, language = "en", useGoogleSearch = true) {
  try {
    // 1. Extraire les composants du code
    const components = extractComponentsFromCode(codeSource);

    if (components.length === 0) {
      return {
        success: false,
        message: language === "fr" ? "Aucun composant détecté" : "No components detected",
        items: [],
      };
    }

    console.log(`🛒 Found ${components.length} components: ${components.join(", ")}`);

    // 2. Rechercher les prix avec Google Search
    let shoppingItems;
    if (useGoogleSearch) {
      const result = await searchComponentPrices(components, language);
      shoppingItems = result.items;
    } else {
      shoppingItems = getFallbackPrices(components);
    }

    // 3. Générer le markdown
    const markdown = generateShoppingMarkdown(shoppingItems, language);

    console.log(`✅ Shopping list generated with ${shoppingItems.length} items`);

    return {
      success: true,
      markdown: markdown,
      items: shoppingItems,
      totalComponents: components.length,
      totalEstimate: shoppingItems
        .reduce((sum, item) => {
          const price = parseFloat(item.price_usd);
          return sum + (isNaN(price) ? 0 : price);
        }, 0)
        .toFixed(2),
    };
  } catch (error) {
    console.error("❌ Shopping list generation error:", error);
    return {
      success: false,
      message: error.message,
      items: [],
    };
  }
}
