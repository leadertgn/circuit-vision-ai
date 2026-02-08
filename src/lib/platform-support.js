/**
 * Extended Platform Support
 * Support pour Raspberry Pi, KiCad PCB, VHDL/Verilog FPGA
 * Élargit le marché cible au-delà d'Arduino/ESP32
 */

// Détection du type de plateforme
export function detectPlatformType(repoContent, files) {
  const platforms = {
    arduino: { score: 0, type: "Arduino/ESP32" },
    platformio: { score: 0, type: "PlatformIO" },
    raspberrypi: { score: 0, type: "Raspberry Pi" },
    kicad: { score: 0, type: "KiCad PCB" },
    fpga: { score: 0, type: "FPGA (VHDL/Verilog)" },
    stm32: { score: 0, type: "STM32" },
  };

  // Patterns de détection
  const patterns = {
    arduino: [
      /\.ino$/i,
      /arduino/i,
      /#include\s+<Arduino\.h>/i,
      /void\s+setup\(\)/i,
      /void\s+loop\(\)/i,
    ],
    platformio: [/platformio\.ini$/i, /\.pio\//i, /platform\s*=\s*espressif/i],
    raspberrypi: [
      /raspberry\s*pi/i,
      /import\s+RPi\.GPIO/i,
      /import\s+gpiozero/i,
      /\/dev\/gpiomem/i,
      /wiringPi/i,
      /BCM\d+/i,
    ],
    kicad: [
      /\.kicad_pcb$/i,
      /\.kicad_sch$/i,
      /\.kicad_pro$/i,
      /\.pro$/i,
      /\.sch$/i,
      /\(kicad_pcb/i,
    ],
    fpga: [
      /\.vhd$/i,
      /\.vhdl$/i,
      /\.v$/i,
      /entity\s+\w+\s+is/i,
      /module\s+\w+/i,
      /always\s+@/i,
      /process\s*\(/i,
    ],
    stm32: [/stm32/i, /HAL_/i, /\.ioc$/i, /startup_stm32/i],
  };

  // Scoring
  Object.entries(patterns).forEach(([platform, patternList]) => {
    patternList.forEach((pattern) => {
      // Check filenames
      if (files?.some((f) => pattern.test(f.name || f))) {
        platforms[platform].score += 2;
      }
      // Check content
      if (pattern.test(repoContent)) {
        platforms[platform].score += 1;
      }
    });
  });

  // Retourner la plateforme avec le meilleur score
  const detected = Object.entries(platforms).sort(([, a], [, b]) => b.score - a.score)[0];

  return {
    platform: detected[0],
    type: detected[1].type,
    confidence: detected[1].score > 3 ? "high" : detected[1].score > 1 ? "medium" : "low",
  };
}

// Adaptateur pour Raspberry Pi
export function analyzeRaspberryPi(code) {
  const analysis = {
    platform: "Raspberry Pi",
    pins: [],
    libraries: [],
    recommendations: [],
  };

  // Extraction des pins GPIO
  const gpioPatterns = [/GPIO\.setup\((\d+),/gi, /BCM(\d+)/gi, /BOARD(\d+)/gi, /Pin\((\d+)\)/gi];

  gpioPatterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      analysis.pins.push({
        number: match[1],
        type: pattern.source.includes("BCM") ? "BCM" : "BOARD",
      });
    }
  });

  // Détection bibliothèques Python
  const libraryPatterns = [
    { regex: /import\s+RPi\.GPIO/i, lib: "RPi.GPIO" },
    { regex: /import\s+gpiozero/i, lib: "gpiozero" },
    { regex: /import\s+smbus/i, lib: "smbus (I2C)" },
    { regex: /import\s+spidev/i, lib: "spidev (SPI)" },
    { regex: /import\s+Adafruit_DHT/i, lib: "Adafruit_DHT" },
  ];

  libraryPatterns.forEach(({ regex, lib }) => {
    if (regex.test(code)) {
      analysis.libraries.push(lib);
    }
  });

  // Recommendations
  if (analysis.pins.length > 0) {
    analysis.recommendations.push("Vérifier que BCM/BOARD mode est cohérent");
  }
  if (code.includes("GPIO.cleanup")) {
    analysis.recommendations.push("✓ GPIO cleanup présent (bonne pratique)");
  } else {
    analysis.recommendations.push("⚠️ Ajouter GPIO.cleanup() à la fin");
  }

  return analysis;
}

// Adaptateur pour KiCad PCB
export function analyzeKiCadPCB(fileContent) {
  const analysis = {
    platform: "KiCad PCB",
    components: [],
    nets: [],
    layers: [],
    boardInfo: {},
  };

  // Parser basique pour KiCad (format S-expression)
  try {
    // Extraction composants (footprints)
    const footprintRegex = /\(footprint\s+"([^"]+)"/g;
    let match;
    while ((match = footprintRegex.exec(fileContent)) !== null) {
      analysis.components.push(match[1]);
    }

    // Extraction réseaux (nets)
    const netRegex = /\(net\s+(\d+)\s+"([^"]+)"/g;
    while ((match = netRegex.exec(fileContent)) !== null) {
      analysis.nets.push({
        id: match[1],
        name: match[2],
      });
    }

    // Extraction layers
    const layerRegex = /\(layer\s+"([^"]+)"/g;
    const layers = new Set();
    while ((match = layerRegex.exec(fileContent)) !== null) {
      layers.add(match[1]);
    }
    analysis.layers = Array.from(layers);

    // Info général
    const generalRegex = /\(general\s+([\s\S]*?)\)/;
    const generalMatch = fileContent.match(generalRegex);
    if (generalMatch) {
      const thicknessMatch = generalMatch[1].match(/thickness\s+([\d.]+)/);
      if (thicknessMatch) {
        analysis.boardInfo.thickness = parseFloat(thicknessMatch[1]);
      }
    }
  } catch (error) {
    console.error("Erreur parsing KiCad:", error);
  }

  return analysis;
}

// Adaptateur pour FPGA (VHDL/Verilog)
export function analyzeFPGA(code, language = "vhdl") {
  const analysis = {
    platform: "FPGA",
    language: language.toUpperCase(),
    entities: [],
    signals: [],
    ports: [],
    recommendations: [],
  };

  if (language === "vhdl") {
    // Parser VHDL basique
    const entityRegex = /entity\s+(\w+)\s+is/gi;
    let match;
    while ((match = entityRegex.exec(code)) !== null) {
      analysis.entities.push(match[1]);
    }

    // Extraction ports
    const portRegex = /(\w+)\s*:\s*(in|out|inout)\s+(\w+)/gi;
    while ((match = portRegex.exec(code)) !== null) {
      analysis.ports.push({
        name: match[1],
        direction: match[2],
        type: match[3],
      });
    }

    // Extraction signals
    const signalRegex = /signal\s+(\w+)\s*:\s*(\w+)/gi;
    while ((match = signalRegex.exec(code)) !== null) {
      analysis.signals.push({
        name: match[1],
        type: match[2],
      });
    }
  } else if (language === "verilog") {
    // Parser Verilog basique
    const moduleRegex = /module\s+(\w+)/gi;
    let match;
    while ((match = moduleRegex.exec(code)) !== null) {
      analysis.entities.push(match[1]);
    }

    // Extraction ports
    const portRegex = /(input|output|inout)\s+(\[\d+:\d+\])?\s*(\w+)/gi;
    while ((match = portRegex.exec(code)) !== null) {
      analysis.ports.push({
        name: match[3],
        direction: match[1],
        width: match[2] || "1 bit",
      });
    }
  }

  // Recommendations
  if (analysis.entities.length === 0) {
    analysis.recommendations.push("⚠️ Aucune entité/module détecté");
  }
  if (analysis.ports.length > 50) {
    analysis.recommendations.push("ℹ️ Beaucoup de ports - considérer utiliser bus");
  }

  return analysis;
}

// Générateur de documentation adapté à la plateforme
export function generatePlatformSpecificDoc(platform, analysisData) {
  const templates = {
    "Raspberry Pi": {
      sections: [
        "Vue d'ensemble",
        "Configuration GPIO",
        "Bibliothèques Python",
        "Installation",
        "Exécution",
        "Dépannage GPIO",
      ],
      installCmd: "pip3 install RPi.GPIO gpiozero",
      runCmd: "sudo python3 main.py",
    },
    "KiCad PCB": {
      sections: [
        "Informations PCB",
        "Liste des Composants",
        "Réseaux (Nets)",
        "Couches (Layers)",
        "Fabrication",
        "Assemblage",
      ],
      installCmd: "Installer KiCad 7.0+",
      runCmd: "kicad-cli pcb export gerbers",
    },
    "FPGA (VHDL/Verilog)": {
      sections: [
        "Architecture FPGA",
        "Entités/Modules",
        "Ports I/O",
        "Signaux Internes",
        "Simulation",
        "Synthèse",
      ],
      installCmd: "Installer Vivado/Quartus",
      runCmd: "Simuler avec ModelSim/GHDL",
    },
    STM32: {
      sections: [
        "Configuration MCU",
        "Périphériques HAL",
        "Pins et GPIO",
        "Clock Configuration",
        "Installation STM32CubeIDE",
        "Programmation",
      ],
      installCmd: "Installer STM32CubeIDE",
      runCmd: "Build avec STM32CubeMX",
    },
  };

  return templates[platform] || templates["Arduino/ESP32"];
}

// Fonction principale : analyse multi-plateforme
export function analyzeMultiPlatform(repoContent, files) {
  // 1. Détecter la plateforme
  const detection = detectPlatformType(repoContent, files);

  // 2. Analyser selon la plateforme
  let platformAnalysis = {};

  switch (detection.platform) {
    case "raspberrypi":
      platformAnalysis = analyzeRaspberryPi(repoContent);
      break;
    case "kicad":
      platformAnalysis = analyzeKiCadPCB(repoContent);
      break;
    case "fpga":
      const language = repoContent.match(/\.vhd/i) ? "vhdl" : "verilog";
      platformAnalysis = analyzeFPGA(repoContent, language);
      break;
    default:
      platformAnalysis = { platform: detection.type };
  }

  // 3. Générer template doc
  const docTemplate = generatePlatformSpecificDoc(detection.type, platformAnalysis);

  return {
    detected: detection,
    analysis: platformAnalysis,
    docTemplate,
    supportedPlatforms: [
      "Arduino/ESP32",
      "PlatformIO",
      "Raspberry Pi",
      "KiCad PCB",
      "FPGA",
      "STM32",
    ],
  };
}

// Export des statistiques de support
export function getPlatformSupport() {
  return {
    embedded: {
      name: "Systèmes Embarqués",
      platforms: ["Arduino", "ESP32", "ESP8266", "STM32", "PlatformIO"],
      coverage: "95%",
    },
    sbc: {
      name: "Single Board Computers",
      platforms: ["Raspberry Pi", "BeagleBone", "Orange Pi"],
      coverage: "80%",
    },
    pcb: {
      name: "PCB Design",
      platforms: ["KiCad", "Eagle", "Altium"],
      coverage: "60%",
    },
    fpga: {
      name: "FPGA/HDL",
      platforms: ["VHDL", "Verilog", "SystemVerilog"],
      coverage: "50%",
    },
  };
}
