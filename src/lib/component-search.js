/**
 * Component Search - Recherche automatique de composants avec prix et liens d'achat
 * Utilise Google Search de Gemini 3 pour trouver les meilleurs prix
 */

/**
 * Extrait les composants du code source
 */
export function extractComponentsFromCode(code) {
  const components = new Set();
  
  // Patterns de composants connus
  const componentPatterns = [
    // Sensors
    { regex: /DHT22|DHT11/gi, component: 'DHT22' },
    { regex: /BMP280|BMP180/gi, component: 'BMP280' },
    { regex: /BME280/gi, component: 'BME280' },
    { regex: /MPU6050|MPU9250/gi, component: 'MPU6050' },
    { regex: /HC-SR04/gi, component: 'HC-SR04' },
    { regex: /MQ-\d+/gi, component: 'MQ-2' },
    
    // Displays
    { regex: /SSD1306|OLED/gi, component: 'OLED SSD1306' },
    { regex: /LCD.*16.*2|1602/gi, component: 'LCD 16x2' },
    { regex: /TFT|ILI9341/gi, component: 'TFT Display' },
    
    // Communication
    { regex: /ESP32/gi, component: 'ESP32' },
    { regex: /ESP8266/gi, component: 'ESP8266' },
    { regex: /nRF24L01/gi, component: 'nRF24L01' },
    { regex: /HC-05|HC-06/gi, component: 'HC-05 Bluetooth' },
    
    // Motors
    { regex: /Servo/gi, component: 'Servo Motor' },
    { regex: /Stepper|28BYJ/gi, component: 'Stepper Motor 28BYJ-48' },
    { regex: /L298N/gi, component: 'L298N Motor Driver' },
    
    // Storage
    { regex: /SD Card|SD_MMC/gi, component: 'SD Card Module' },
    
    // Power
    { regex: /LM2596|Buck/gi, component: 'LM2596 Buck Converter' },
    { regex: /AMS1117|LDO/gi, component: 'AMS1117 3.3V Regulator' },
    
    // Others
    { regex: /Relay/gi, component: 'Relay Module' },
    { regex: /LED Strip|WS2812|NeoPixel/gi, component: 'WS2812 LED Strip' },
  ];

  componentPatterns.forEach(pattern => {
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
  const escapedComponent = component.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedComponent, 'gi');
  const matches = code.match(regex);
  return matches ? Math.min(matches.length, 5) : 1; // Max 5 par sécurité
}

/**
 * Génère la prompt pour Gemini avec Google Search
 */
export function generateSearchPrompt(components) {
  return `
🛒 SHOPPING LIST - Recherche de composants électroniques

Pour chaque composant suivant, trouve les informations d'achat :

${components.map((comp, idx) => `${idx + 1}. ${comp}`).join('\n')}

Pour chaque composant, fournis :
1. Prix moyen (en USD ou EUR)
2. 2-3 liens d'achat fiables (Amazon, AliExpress, Mouser, etc.)
3. Alternatives compatibles si disponibles

Utilise Google Search pour obtenir les prix actuels et les meilleurs revendeurs.
`;
}

/**
 * Parse la réponse de Gemini pour extraire les liens et prix
 */
export function parseSearchResults(searchResponse, components) {
  const shoppingList = [];

  components.forEach(component => {
    // Patterns pour extraire prix et liens
    const pricePattern = new RegExp(`${component}[^$€]*[$€]\\s*(\\d+[.,]?\\d*)`, 'i');
    const linkPattern = /https?:\/\/[^\s]+/g;

    const priceMatch = searchResponse.match(pricePattern);
    const links = searchResponse.match(linkPattern) || [];

    shoppingList.push({
      component,
      quantity: 1,
      estimated_price: priceMatch ? `$${priceMatch[1]}` : 'Prix à vérifier',
      purchase_links: links.slice(0, 3),
      alternatives: [] // Peut être enrichi plus tard
    });
  });

  return shoppingList;
}

/**
 * Génère un tableau markdown de la shopping list
 */
export function generateShoppingListMarkdown(shoppingList, totalEstimate = null) {
  if (!shoppingList || shoppingList.length === 0) {
    return '';
  }

  let markdown = `## 🛒 Liste de Courses\n\n`;
  markdown += `| Composant | Quantité | Prix estimé | Liens d'achat |\n`;
  markdown += `|-----------|----------|-------------|---------------|\n`;

  shoppingList.forEach(item => {
    const links = item.purchase_links?.length > 0
      ? item.purchase_links.slice(0, 2).map(link => `[🔗](${link})`).join(' ')
      : 'Recherche manuelle';

    markdown += `| ${item.component} | ${item.quantity} | ${item.estimated_price} | ${links} |\n`;
  });

  if (totalEstimate) {
    markdown += `\n**Coût total estimé :** ~${totalEstimate}\n`;
  }

  markdown += `\n> 💡 Prix indicatifs - vérifiez la disponibilité et les frais de port\n`;

  return markdown;
}

/**
 * Ajoute des alternatives pour chaque composant
 */
export function enrichWithAlternatives(component) {
  const alternatives = {
    'DHT22': ['DHT11 (moins précis)', 'AM2302', 'SHT31'],
    'ESP32': ['ESP32-WROOM', 'ESP32-S2', 'ESP32-C3'],
    'BMP280': ['BMP180', 'BME280 (avec humidité)'],
    'MPU6050': ['MPU9250 (avec magnétomètre)', 'MPU6500'],
    'OLED SSD1306': ['SSD1309', 'SH1106'],
    'Servo Motor': ['SG90', 'MG90S (métal)', 'MG996R (puissant)'],
    'L298N Motor Driver': ['DRV8833', 'TB6612', 'L293D'],
  };

  return alternatives[component] || [];
}

/**
 * FONCTION PRINCIPALE - Génère la shopping list complète
 */
export async function generateShoppingList(codeSource, useGeminiSearch = false) {
  try {
    // 1. Extraire les composants du code
    const components = extractComponentsFromCode(codeSource);

    if (components.length === 0) {
      return {
        success: false,
        message: 'Aucun composant détecté dans le code',
        items: []
      };
    }

    // 2. Créer la liste basique
    let shoppingList = components.map(comp => ({
      component: comp,
      quantity: estimateQuantity(codeSource, comp),
      estimated_price: 'À rechercher',
      purchase_links: [],
      alternatives: enrichWithAlternatives(comp)
    }));

    // 3. Si Gemini Search est activé, enrichir avec prix réels
    if (useGeminiSearch) {
      console.log('🔍 Recherche des prix avec Google Search...');
      // Cette partie sera appelée dans la route API avec tools: [{ googleSearch: {} }]
    }

    console.log(`🛒 Shopping list générée: ${components.length} composants`);

    return {
      success: true,
      items: shoppingList,
      totalComponents: components.length
    };

  } catch (error) {
    console.error('Erreur génération shopping list:', error);
    return {
      success: false,
      error: error.message,
      items: []
    };
  }
}