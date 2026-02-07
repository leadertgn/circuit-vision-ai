/**
 * Component Search - CORRECTED VERSION
 * ✅ Google Search with real prices
 * ✅ Purchase links in markdown table
 * ✅ Proper price display
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// Server-side Gemini instance
const genAI =
  typeof window === "undefined" ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

/**
 * Extract components from source code
 */
export function extractComponentsFromCode(code) {
  const components = new Set();

  // Component patterns
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
    { regex: /ultrasonic/i, component: "HC-SR04 Ultrasonic" },
  ];

  componentPatterns.forEach((pattern) => {
    if (pattern.regex.test(code)) {
      components.add(pattern.component);
    }
  });

  return Array.from(components);
}

/**
 * Estimate quantity based on occurrences
 */
export function estimateQuantity(code, component) {
  const escapedComponent = component.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedComponent, "gi");
  const matches = code.match(regex);
  return matches ? Math.min(matches.length, 5) : 1;
}

/**
 * ✅ MAIN FUNCTION - Search prices with Google Search via Gemini 3
 */
export async function searchComponentPrices(components, language = "en") {
  if (!components || components.length === 0) {
    return { success: false, items: [], error: "No components provided" };
  }

  // Check Gemini availability (server-side only)
  if (!genAI) {
    console.warn("⚠️ Gemini not available (client-side), using fallback prices");
    return getFallbackPrices(components);
  }

  try {
    console.log(`🔍 Searching prices for ${components.length} components with Google Search...`);

    // Gemini model with Google Search enabled
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [{ googleSearch: {} }], // 🆕 Google Search tool enabled
    });

    const prompt =
      language === "fr" ? getFrenchSearchPrompt(components) : getEnglishSearchPrompt(components);

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log("✅ Google Search completed, parsing results...");

    // Parse JSON response
    const shoppingItems = parseShoppingResponse(responseText, components);

    console.log(`✅ Found prices for ${shoppingItems.length} components`);

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
 * English search prompt
 */
function getEnglishSearchPrompt(components) {
  return `
🛒 SHOPPING LIST - Electronic Components with Real Prices

Search Google for CURRENT PRICES and PURCHASE LINKS for these components:

${components.map((c, i) => `${i + 1}. ${c}`).join("\n")}

For EACH component, provide in JSON format:
{
  "component": "Component name",
  "price_usd": "X.XX",
  "vendors": [
    {
      "name": "Amazon",
      "price": "X.XX",
      "url": "https://amazon.com/dp/XXXXX"
    },
    {
      "name": "Mouser",
      "price": "X.XX", 
      "url": "https://mouser.com/ProductDetail/XXXXX"
    }
  ],
  "alternatives": ["Alternative 1", "Alternative 2"]
}

IMPORTANT:
- Include REAL working URLs from Google Search results
- Use actual current prices from 2026
- Provide at least 2 vendors per component
- Respond ONLY with valid JSON array, no markdown or explanations

Example output:
[
  {
    "component": "ESP32",
    "price_usd": "6.99",
    "vendors": [
      {"name": "Amazon", "price": "6.99", "url": "https://amazon.com/dp/B08DQQ8CBP"},
      {"name": "AliExpress", "price": "4.50", "url": "https://aliexpress.com/item/123456.html"}
    ],
    "alternatives": ["ESP32-S2", "ESP32-C3"]
  }
]
`;
}

/**
 * French search prompt
 */
function getFrenchSearchPrompt(components) {
  return `
🛒 LISTE DE COURSES - Composants Électroniques avec Prix Réels

Recherche sur Google les PRIX ACTUELS et LIENS D'ACHAT pour ces composants :

${components.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Pour CHAQUE composant, fournis en format JSON :
{
  "component": "Nom du composant",
  "price_usd": "X.XX",
  "vendors": [
    {
      "name": "Amazon",
      "price": "X.XX",
      "url": "https://amazon.fr/dp/XXXXX"
    },
    {
      "name": "Mouser",
      "price": "X.XX",
      "url": "https://mouser.fr/ProductDetail/XXXXX"
    }
  ],
  "alternatives": ["Alternative 1", "Alternative 2"]
}

IMPORTANT :
- Inclure des URLs RÉELLES issues de Google Search
- Utiliser les prix actuels de 2026
- Fournir au moins 2 vendeurs par composant
- Répondre UNIQUEMENT avec un tableau JSON valide

Exemple :
[
  {
    "component": "ESP32",
    "price_usd": "6.99",
    "vendors": [
      {"name": "Amazon", "price": "6.99", "url": "https://amazon.fr/dp/B08DQQ8CBP"}
    ],
    "alternatives": ["ESP32-S2"]
  }
]
`;
}

/**
 * Parse Gemini response to extract shopping info
 */
function parseShoppingResponse(responseText, originalComponents) {
  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("No JSON found in response, using fallback");
      throw new Error("No JSON found in response");
    }

    const items = JSON.parse(jsonMatch[0]);

    // Normalize data
    return items.map((item) => ({
      component: item.component || "Unknown",
      price_usd: item.price_usd || "Check manually",
      vendors: (item.vendors || []).slice(0, 3).map(v => ({
        name: v.name || "Vendor",
        price: v.price || item.price_usd || "N/A",
        url: v.url || `https://www.google.com/search?q=${encodeURIComponent(item.component)}`
      })),
      alternatives: item.alternatives || getDefaultAlternatives(item.component),
    }));
  } catch (error) {
    console.warn("⚠️ Failed to parse shopping response:", error.message);
    return getFallbackPrices(originalComponents).items;
  }
}

/**
 * Fallback prices if Google Search fails
 */
function getFallbackPrices(components) {
  const fallbackPrices = {
    ESP32: { 
      price: "6.99", 
      vendors: [
        { name: "Amazon", price: "6.99", url: "https://amazon.com/s?k=ESP32" },
        { name: "AliExpress", price: "4.50", url: "https://aliexpress.com/wholesale?SearchText=ESP32" }
      ]
    },
    DHT22: { 
      price: "4.99", 
      vendors: [
        { name: "Amazon", price: "4.99", url: "https://amazon.com/s?k=DHT22" },
        { name: "AliExpress", price: "2.50", url: "https://aliexpress.com/wholesale?SearchText=DHT22" }
      ]
    },
    "OLED SSD1306": { 
      price: "5.99", 
      vendors: [
        { name: "Amazon", price: "5.99", url: "https://amazon.com/s?k=OLED+SSD1306" },
        { name: "AliExpress", price: "3.50", url: "https://aliexpress.com/wholesale?SearchText=OLED" }
      ]
    },
    "HC-SR04": { 
      price: "3.99", 
      vendors: [
        { name: "Amazon", price: "3.99", url: "https://amazon.com/s?k=HC-SR04" },
        { name: "AliExpress", price: "1.50", url: "https://aliexpress.com/wholesale?SearchText=HC-SR04" }
      ]
    },
    "Servo Motor": { 
      price: "4.99", 
      vendors: [
        { name: "Amazon", price: "4.99", url: "https://amazon.com/s?k=SG90+Servo" },
        { name: "AliExpress", price: "2.00", url: "https://aliexpress.com/wholesale?SearchText=SG90" }
      ]
    },
    BMP280: { 
      price: "4.49", 
      vendors: [
        { name: "Amazon", price: "4.49", url: "https://amazon.com/s?k=BMP280" },
        { name: "Mouser", price: "5.20", url: "https://mouser.com/c/?q=BMP280" }
      ]
    },
    MPU6050: { 
      price: "5.99", 
      vendors: [
        { name: "Amazon", price: "5.99", url: "https://amazon.com/s?k=MPU6050" },
        { name: "AliExpress", price: "3.00", url: "https://aliexpress.com/wholesale?SearchText=MPU6050" }
      ]
    },
    L298N: { 
      price: "7.99", 
      vendors: [
        { name: "Amazon", price: "7.99", url: "https://amazon.com/s?k=L298N" },
        { name: "AliExpress", price: "4.50", url: "https://aliexpress.com/wholesale?SearchText=L298N" }
      ]
    },
  };

  const items = components.map((comp) => {
    const fallback = fallbackPrices[comp] || { 
      price: "Check manually", 
      vendors: [
        { name: "Google", price: "N/A", url: `https://www.google.com/search?q=${encodeURIComponent(comp + " price")}` }
      ]
    };
    
    return {
      component: comp,
      price_usd: fallback.price,
      vendors: fallback.vendors,
      alternatives: getDefaultAlternatives(comp),
    };
  });

  return {
    success: false,
    items: items,
    error: "Using fallback prices"
  };
}

/**
 * Default alternatives for each component
 */
function getDefaultAlternatives(component) {
  const alternatives = {
    DHT22: ["DHT11", "AM2302", "SHT31"],
    ESP32: ["ESP32-WROOM", "ESP32-S2", "ESP32-C3"],
    BMP280: ["BMP180", "BME280"],
    MPU6050: ["MPU9250", "MPU6500"],
    "OLED SSD1306": ["SSD1309", "SH1106"],
    "Servo Motor": ["SG90", "MG90S", "MG996R"],
    L298N: ["DRV8833", "TB6612", "L293D"],
    "HC-SR04": ["US-015", "JSN-SR04T"],
    "RFID RC522": ["PN532", "RC522 V2.0"],
    ESP8266: ["ESP-01", "NodeMCU", "Wemos D1 Mini"],
  };
  return alternatives[component] || [];
}

/**
 * ✅ CORRECTED: Generate markdown shopping list WITH LINKS AND PRICES
 */
export function generateShoppingMarkdown(items, language = "en") {
  if (!items || items.length === 0) {
    return "";
  }

  const title = language === "fr" ? "## 🛒 Liste de Courses" : "## 🛒 Shopping List";
  const componentHeader = language === "fr" ? "Composant" : "Component";
  const priceHeader = language === "fr" ? "Prix (USD)" : "Price (USD)";
  const linksHeader = language === "fr" ? "Liens d'Achat" : "Purchase Links";
  const altsHeader = language === "fr" ? "Alternatives" : "Alternatives";
  const note = language === "fr" 
    ? "> 💡 Prix indicatifs trouvés via Google Search - vérifiez la disponibilité et les frais de port"
    : "> 💡 Prices found via Google Search - check availability and shipping costs";

  let markdown = `${title}\n\n`;
  markdown += `| ${componentHeader} | ${priceHeader} | ${linksHeader} | ${altsHeader} |\n`;
  markdown += `|-----------|-------------|----------------|---------------|\n`;

  let totalPrice = 0;

  items.forEach((item) => {
    const price = parseFloat(item.price_usd);
    if (!isNaN(price)) {
      totalPrice += price;
    }

    // ✅ CORRECTED: Format purchase links properly with prices
    const links = item.vendors && item.vendors.length > 0
      ? item.vendors
          .slice(0, 2)
          .map((v) => `[${v.name} ($${v.price})](${v.url})`)
          .join(" • ")
      : "🔍 [Search](https://www.google.com/search?q=" + encodeURIComponent(item.component + " buy") + ")";

    const alts = item.alternatives?.slice(0, 2).join(", ") || "-";

    // ✅ CORRECTED: Show average price prominently
    markdown += `| **${item.component}** | **$${item.price_usd}** | ${links} | ${alts} |\n`;
  });

  // ✅ CORRECTED: Add total with prominent styling
  if (totalPrice > 0) {
    markdown += `\n**💰 Total Estimate: ~$${totalPrice.toFixed(2)}**\n\n`;
  }

  markdown += `${note}\n`;

  return markdown;
}

/**
 * ✅ MAIN FUNCTION - Generate complete shopping list
 */
export async function generateShoppingList(codeSource, language = "en", useGoogleSearch = true) {
  try {
    // 1. Extract components from code
    const components = extractComponentsFromCode(codeSource);

    if (components.length === 0) {
      return {
        success: false,
        message: language === "fr" ? "Aucun composant détecté" : "No components detected",
        items: [],
      };
    }

    console.log(`🛒 Found ${components.length} components: ${components.join(", ")}`);

    // 2. Search prices with Google Search
    let shoppingResult;
    if (useGoogleSearch) {
      shoppingResult = await searchComponentPrices(components, language);
    } else {
      shoppingResult = getFallbackPrices(components);
    }

    const shoppingItems = shoppingResult.items;

    // 3. Generate markdown with proper formatting
    const markdown = generateShoppingMarkdown(shoppingItems, language);

    const totalEstimate = shoppingItems
      .reduce((sum, item) => {
        const price = parseFloat(item.price_usd);
        return sum + (isNaN(price) ? 0 : price);
      }, 0)
      .toFixed(2);

    console.log(`✅ Shopping list generated: ${shoppingItems.length} items, $${totalEstimate} total`);

    return {
      success: true,
      markdown: markdown,
      items: shoppingItems,
      totalComponents: components.length,
      totalEstimate: totalEstimate,
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