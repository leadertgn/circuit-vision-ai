/**
 * Hardware Validator - Détecte automatiquement les bugs dans les circuits embarqués
 * Innovation majeure pour le hackathon Gemini 3
 */

// Règles de validation hardware
const VALIDATION_RULES = {
  // Pins ESP32 avec restrictions
  ESP32_RESTRICTED_PINS: [
    { pin: "GPIO6", reason: "Utilisé par Flash SPI", severity: "critical" },
    { pin: "GPIO7", reason: "Utilisé par Flash SPI", severity: "critical" },
    { pin: "GPIO8", reason: "Utilisé par Flash SPI", severity: "critical" },
    { pin: "GPIO9", reason: "Utilisé par Flash SPI", severity: "critical" },
    { pin: "GPIO10", reason: "Utilisé par Flash SPI", severity: "critical" },
    { pin: "GPIO11", reason: "Utilisé par Flash SPI", severity: "critical" },
    { pin: "GPIO0", reason: "Boot mode - Pull-up requis", severity: "warning" },
    { pin: "GPIO2", reason: "Boot mode - Pull-down requis", severity: "warning" },
  ],

  // Voltage par composant
  VOLTAGE_REQUIREMENTS: {
    DHT22: { voltage: "3.3-5V", max: 5.0, min: 3.3 },
    DHT11: { voltage: "3.3-5V", max: 5.0, min: 3.3 },
    BMP280: { voltage: "3.3V", max: 3.6, min: 1.8 },
    MPU6050: { voltage: "3.3V", max: 3.6, min: 2.3 },
    OLED: { voltage: "3.3V", max: 3.6, min: 3.0 },
    "SD Card": { voltage: "3.3V", max: 3.6, min: 2.7 },
    Servo: { voltage: "5V", max: 6.0, min: 4.8 },
  },

  // Conflits I2C/SPI
  I2C_DEFAULT_PINS: {
    ESP32: { SDA: "GPIO21", SCL: "GPIO22" },
    ESP8266: { SDA: "GPIO4", SCL: "GPIO5" },
    Arduino: { SDA: "A4", SCL: "A5" },
  },

  // Timing critiques
  CRITICAL_DELAYS: {
    DHT_MIN_INTERVAL: 2000, // DHT22 nécessite 2s entre lectures
    I2C_INIT_DELAY: 100, // Délai d'initialisation I2C
    WIFI_CONNECT_TIMEOUT: 10000,
  },
};

/**
 * Extrait les déclarations de pins du code
 */
export function extractPinDeclarations(code) {
  const pins = [];
  const defineRegex = /#define\s+(\w+)\s+(GPIO)?(\d+|[A-Z]\d+)/gi;
  const constRegex = /const\s+int\s+(\w+)\s*=\s*(GPIO)?(\d+)/gi;

  let match;
  while ((match = defineRegex.exec(code)) !== null) {
    pins.push({
      name: match[1],
      pin: match[2] ? `${match[2]}${match[3]}` : match[3],
      type: "define",
    });
  }

  while ((match = constRegex.exec(code)) !== null) {
    pins.push({
      name: match[1],
      pin: match[2] ? `${match[2]}${match[3]}` : match[3],
      type: "const",
    });
  }

  return pins;
}

/**
 * Détecte les conflits de pins
 */
export function detectPinConflicts(pins) {
  const conflicts = [];
  const usedPins = new Map();

  pins.forEach((pinDecl) => {
    const existing = usedPins.get(pinDecl.pin);
    if (existing) {
      conflicts.push({
        severity: "critical",
        type: "pin_conflict",
        description: `Pin ${pinDecl.pin} utilisé deux fois: ${existing.name} et ${pinDecl.name}`,
        location: `Déclarations multiples`,
        suggestion: `Utiliser des pins différents ou vérifier la logique`,
      });
    }
    usedPins.set(pinDecl.pin, pinDecl);
  });

  return conflicts;
}

/**
 * Détecte l'utilisation de pins restreints ESP32
 */
export function detectRestrictedPins(pins, platform = "ESP32") {
  const warnings = [];

  if (platform.includes("ESP32")) {
    pins.forEach((pinDecl) => {
      const restricted = VALIDATION_RULES.ESP32_RESTRICTED_PINS.find((r) =>
        pinDecl.pin.includes(r.pin.replace("GPIO", ""))
      );

      if (restricted) {
        warnings.push({
          severity: restricted.severity,
          type: "restricted_pin",
          description: `${pinDecl.pin} (${pinDecl.name}): ${restricted.reason}`,
          location: `Déclaration de ${pinDecl.name}`,
          suggestion:
            restricted.severity === "critical"
              ? `NE JAMAIS utiliser ${pinDecl.pin}`
              : `Éviter ${pinDecl.pin} ou ajouter résistance pull-up/down`,
        });
      }
    });
  }

  return warnings;
}

/**
 * Détecte les problèmes de voltage
 */
export function detectVoltageIssues(code, components) {
  const issues = [];

  // Détecter si 5V est envoyé à un composant 3.3V
  const voltage5VPattern = /5V|VCC|Vin/gi;
  const hasHighVoltage = voltage5VPattern.test(code);

  if (hasHighVoltage) {
    components.forEach((comp) => {
      const requirement = VALIDATION_RULES.VOLTAGE_REQUIREMENTS[comp.component];
      if (requirement && requirement.max < 5.0) {
        issues.push({
          severity: "critical",
          type: "voltage_mismatch",
          description: `${comp.component} ne supporte que ${requirement.voltage} mais le code utilise 5V`,
          location: `Composant ${comp.component} sur pin ${comp.pin}`,
          suggestion: `Utiliser un diviseur de tension ou alimenter en 3.3V`,
        });
      }
    });
  }

  return issues;
}

/**
 * Détecte les problèmes I2C/SPI
 */
export function detectBusConflicts(code, pins) {
  const conflicts = [];

  // Détecter utilisation I2C
  const hasI2C = /Wire\.begin|I2C|i2c/i.test(code);

  if (hasI2C) {
    const defaultI2C = VALIDATION_RULES.I2C_DEFAULT_PINS.ESP32;

    // Vérifier si les pins I2C par défaut sont utilisées pour autre chose
    pins.forEach((pinDecl) => {
      if (pinDecl.pin === defaultI2C.SDA || pinDecl.pin === defaultI2C.SCL) {
        if (
          !pinDecl.name.toLowerCase().includes("sda") &&
          !pinDecl.name.toLowerCase().includes("scl")
        ) {
          conflicts.push({
            severity: "warning",
            type: "i2c_pin_conflict",
            description: `${pinDecl.pin} est le pin I2C par défaut mais utilisé pour ${pinDecl.name}`,
            location: `Déclaration de ${pinDecl.name}`,
            suggestion: `Si I2C utilisé, réaffecter ${pinDecl.name} à un autre pin`,
          });
        }
      }
    });
  }

  return conflicts;
}

/**
 * Détecte les problèmes de timing
 */
export function detectTimingIssues(code) {
  const issues = [];

  // DHT22 lu trop souvent
  if (/DHT22|DHT11/i.test(code)) {
    const delayPattern = /delay\((\d+)\)/gi;
    let match;
    const delays = [];

    while ((match = delayPattern.exec(code)) !== null) {
      delays.push(parseInt(match[1]));
    }

    const hasSufficientDelay = delays.some(
      (d) => d >= VALIDATION_RULES.CRITICAL_DELAYS.DHT_MIN_INTERVAL
    );

    if (!hasSufficientDelay) {
      issues.push({
        severity: "warning",
        type: "timing_issue",
        description: `DHT22/DHT11 nécessite minimum 2000ms entre lectures`,
        location: `Loop principale`,
        suggestion: `Ajouter delay(2000) ou utiliser millis() pour intervalle >= 2s`,
      });
    }
  }

  return issues;
}

/**
 * Détecte les credentials hardcodés
 */
export function detectHardcodedCredentials(code) {
  const issues = [];

  const patterns = [
    { regex: /const\s+char\s*\*\s*ssid\s*=\s*"([^"]+)"/i, type: "WiFi SSID" },
    { regex: /const\s+char\s*\*\s*password\s*=\s*"([^"]+)"/i, type: "WiFi Password" },
    { regex: /const\s+char\s*\*\s*api[_-]?key\s*=\s*"([^"]+)"/i, type: "API Key" },
  ];

  patterns.forEach((pattern) => {
    if (pattern.regex.test(code)) {
      issues.push({
        severity: "info",
        type: "security_warning",
        description: `${pattern.type} hardcodé détecté dans le code`,
        location: `Configuration réseau`,
        suggestion: `Déplacer dans un fichier config.h non versionné ou utiliser variables d'environnement`,
      });
    }
  });

  return issues;
}

/**
 * FONCTION PRINCIPALE - Analyse complète du code
 */
export function analyzeHardwareCode(codeSource, components = []) {
  const allBugs = [];

  // Extraction des pins
  const pins = extractPinDeclarations(codeSource);

  // Détection des différents types de bugs
  allBugs.push(...detectPinConflicts(pins));
  allBugs.push(...detectRestrictedPins(pins));
  allBugs.push(...detectVoltageIssues(codeSource, components));
  allBugs.push(...detectBusConflicts(codeSource, pins));
  allBugs.push(...detectTimingIssues(codeSource));
  allBugs.push(...detectHardcodedCredentials(codeSource));

  // Statistiques
  const stats = {
    total: allBugs.length,
    critical: allBugs.filter((b) => b.severity === "critical").length,
    warnings: allBugs.filter((b) => b.severity === "warning").length,
    info: allBugs.filter((b) => b.severity === "info").length,
  };

  console.log("🔍 Analyse hardware:", stats);

  return {
    bugs: allBugs,
    stats,
    pins,
    isValid: stats.critical === 0,
  };
}

/**
 * Génère un rapport markdown des bugs
 */
export function generateBugReport(analysisResult) {
  const { bugs, stats } = analysisResult;

  if (bugs.length === 0) {
    return "✅ **Aucun problème détecté** - Le code semble correct !";
  }

  let report = `## 🔍 Analyse Hardware - ${stats.total} problème(s) détecté(s)\n\n`;

  if (stats.critical > 0) {
    report += `### ❌ CRITIQUE (${stats.critical})\n\n`;
    bugs
      .filter((b) => b.severity === "critical")
      .forEach((bug) => {
        report += `- **${bug.type}**: ${bug.description}\n`;
        report += `  - 📍 ${bug.location}\n`;
        report += `  - 💡 ${bug.suggestion}\n\n`;
      });
  }

  if (stats.warnings > 0) {
    report += `### ⚠️ AVERTISSEMENTS (${stats.warnings})\n\n`;
    bugs
      .filter((b) => b.severity === "warning")
      .forEach((bug) => {
        report += `- **${bug.type}**: ${bug.description}\n`;
        report += `  - 💡 ${bug.suggestion}\n\n`;
      });
  }

  if (stats.info > 0) {
    report += `### ℹ️ INFORMATIONS (${stats.info})\n\n`;
    bugs
      .filter((b) => b.severity === "info")
      .forEach((bug) => {
        report += `- ${bug.description}\n`;
        report += `  - 💡 ${bug.suggestion}\n\n`;
      });
  }

  return report;
}
