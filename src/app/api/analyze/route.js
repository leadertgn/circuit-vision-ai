import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase";
import { getRepoContent } from "@/lib/github";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { NextResponse } from "next/server";
import { sanitizeMermaidCode } from "@/lib/mermaid-validator";
import { extractGithubUrl } from "@/lib/doc-completion-detector";
import { analyzeHardwareCode } from "@/lib/hardware-validator";
import {
  extractComponentsFromCode,
  searchComponentPrices,
} from "@/lib/component-search";
import { detectPlatformType } from "@/lib/platform-support";
import { DocumentationSchema } from "@/lib/schemas";
import { zodToJsonSchema } from "zod-to-json-schema";

// Server-side API key only
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const maxDuration = 60;
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

//  RATE LIMITING SIMPLE (en mÃ©moire)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const windowData = requestCounts.get(ip);

  if (!windowData || now - windowData.windowStart > RATE_LIMIT_WINDOW) {
    requestCounts.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (windowData.count >= MAX_REQUESTS_PER_WINDOW) {
    const waitTime = Math.ceil((RATE_LIMIT_WINDOW - (now - windowData.windowStart)) / 1000);
    return { allowed: false, remaining: 0, waitTime };
  }

  windowData.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - windowData.count };
}

// MULTILINGUAL PROMPTS - Auto-detect language
const LANGUAGE_PROMPTS = {
  en: {
    role: "You are CircuitVision AI, an Expert in Embedded Systems.",
    mermaidNote: "NOTE: Use ONLY flowchart TD with alphanumeric IDs. NO flowchart LR.",
    stopMessage: "STOP after section 8. Generate NO additional content.",
    langNote: "LANGUAGE: English only",
    statusMessage: "Analysis in progress...",
    bugsMessage: "HARDWARE BUGS DETECTED:",
    bugsCount: (total, critical, warnings) =>
      `${total} bugs found (${critical} critical, ${warnings} warnings)`,
    bugsIntegration:
      'Integrate these bugs in your "Testing & Troubleshooting" section with their solutions.',
    componentsMessage: "DETECTED COMPONENTS:",
    componentsInstruction: 'Include these in a "Shopping List" section.',
    platformMessage: "DETECTED PLATFORM:",
    platformInstruction: "Adapt your documentation for this platform.",
    githubCode: "GITHUB PROJECT SOURCE CODE:",
    sections: `
## 1. Overview
Objective (2-3 sentences) + Architecture

## 2. Hardware Components
Table: Component | Pin | Function | Notes

## 3. Pin Configuration
Extracted #define code

## 4. Libraries
#include list with purposes

## 5. Code Logic
setup(), loop(), critical functions

## 6. Wiring Diagram
Mermaid diagram (flowchart TD only)

## 7. Installation
Concrete steps

## 8. Testing & Troubleshooting
Checkpoints
`,
  },
  fr: {
    role: "Tu es CircuitVision AI, Expert en Systemes Embarques.",
    mermaidNote:
      "NOTE: Utilise UNIQUEMENT flowchart TD avec IDs alphanumeriques. PAS flowchart LR.",
    stopMessage: "STOP apres la section 8. Ne genere AUCUN contenu supplementaire.",
    langNote: "LANGUE: Francais uniquement",
    statusMessage: "Analyse en cours...",
    bugsMessage: "BUGS HARDWARE DETECTES:",
    bugsCount: (total, critical, warnings) =>
      `${total} bugs trouves (${critical} critiques, ${warnings} avertissements)`,
    bugsIntegration: 'Integre ces bugs dans ta section "Tests et Depannage" avec leurs solutions.',
    componentsMessage: "COMPOSANTS DETECTES:",
    componentsInstruction: 'Cree une section "Shopping List" avec ces composants.',
    platformMessage: "PLATEFORME DETECTEE:",
    platformInstruction: "Adapte ta documentation pour cette plateforme.",
    githubCode: "CODE SOURCE DU PROJET GITHUB:",
    sections: `
## 1. Vue d'ensemble
Objectif (2-3 phrases) + Architecture

## 2. Composants Hardware
Tableau: Composant | Pin | Fonction | Notes

## 3. Configuration des Pins
Code #define extrait

## 4. Bibliotheques
Liste #include avec roles

## 5. Logique du Code
setup(), loop(), fonctions critiques

## 6. Schema de Cablage
Diagramme Mermaid (flowchart TD uniquement)

## 7. Installation
Etapes concretes

## 8. Tests et Depannage
Points de controle
`,
  },
  es: {
    role: "Eres CircuitVision AI, un Experto en Sistemas Embebidos.",
    mermaidNote: "NOTA: Usa SOLO flowchart TD con IDs alfanumericos. SIN flowchart LR.",
    stopMessage: "STOP despues de la seccion 8. NO generes contenido adicional.",
    langNote: "IDIOMA: Espanol unicamente",
    statusMessage: "Analisis en progreso...",
    bugsMessage: "ERRORES DE HARDWARE DETECTADOS:",
    bugsCount: (total, critical, warnings) =>
      `${total} errores encontrados (${critical} criticos, ${warnings} advertencias)`,
    bugsIntegration: 'Integra estos errores en tu seccion "Pruebas y Solucion" con sus soluciones.',
    componentsMessage: "COMPONENTES DETECTADOS:",
    componentsInstruction: 'Incluye estos en una seccion "Lista de Compras".',
    platformMessage: "PLATAFORMA DETECTADA:",
    platformInstruction: "Adapta tu documentacion para esta plataforma.",
    githubCode: "CODIGO FUENTE DEL PROYECTO GITHUB:",
    sections: `
## 1. Vision General
Objetivo (2-3 oraciones) + Arquitectura

## 2. Componentes de Hardware
Tabla: Componente | Pin | Funcion | Notas

## 3. Configuracion de Pines
Codigo #define extraido

## 4. Librerias
Lista #include con propositos

## 5. Logica del Codigo
setup(), loop(), funciones criticas

## 6. Diagrama de Cableado
Diagrama Mermaid (flowchart TD unicamente)

## 7. Instalacion
Pasos concretos

## 8. Pruebas y Solucion de Problemas
Puntos de control
`,
  },
};

// Build system instruction based on detected language
function buildSystemInstruction(userLanguage = "en") {
  const lang = LANGUAGE_PROMPTS[userLanguage] || LANGUAGE_PROMPTS["en"];

  return `
${lang.role}

You can analyze:
1. SOURCE CODE (Arduino, ESP32, etc.)
2. IMAGES of PCB circuits
3. VIDEOS of hardware setups

For IMAGES/VIDEOS:
- Describe visible components
- Propose wiring diagram
- Ask for code if available

NEVER:
- Invent information not present in code
- Mention components not in code
- Speculate on architecture if unclear
- Generate multiple versions
- Repeat yourself

ALWAYS:
- Analyze ONLY provided source code
- Stay factual and precise
- Cite files and line numbers
- Be concise and direct

${lang.mermaidNote}

MANDATORY STRUCTURE (8 SECTIONS MAX):

${lang.sections}

${lang.stopMessage}

${lang.langNote}
`;
}

const SYSTEM_INSTRUCTION = `
Tu es CircuitVision AI, Expert en SystÃ¨mes EmbarquÃ©s.

Tu peux analyser:
1. DU CODE SOURCE (Arduino, ESP32, etc.)
2. DES IMAGES de circuits PCB
3. DES VIDÃ‰OS de montages

Pour les IMAGES/VIDÃ‰OS:
- DÃ©cris les composants visibles
- Propose un schÃ©ma de cÃ¢blage
- Demande le code si disponible


âŒ NE JAMAIS :
- Inventer des informations non prÃ©sentes dans le code
- Parler de composants non mentionnÃ©s dans le code
- SpÃ©culer sur l'architecture si pas Ã©vident
- GÃ©nÃ©rer plusieurs versions de la mÃªme chose
- Te rÃ©pÃ©ter ou rÃ©gÃ©nÃ©rer du contenu dÃ©jÃ  Ã©crit

âœ… TOUJOURS :
- Analyser UNIQUEMENT le code source fourni
- Rester factuel et prÃ©cis
- Citer les fichiers et lignes de code
- ÃŠtre concis et direct

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“‹ STRUCTURE OBLIGATOIRE (8 SECTIONS MAX)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

Pour un projet GitHub, gÃ©nÃ¨re EXACTEMENT ces sections :

## 1. Vue d'ensemble
Objectif (2-3 phrases) + Architecture

## 2. Composants Hardware
Tableau : Composant | Pin | Fonction | Notes

## 3. Configuration des Pins
Code extrait avec #define

## 4. BibliothÃ¨ques
Liste #include avec rÃ´les

## 5. Logique du Code
setup(), loop(), fonctions critiques

## 6. SchÃ©ma de CÃ¢blage
Diagramme Mermaid (RESPECTE RÃˆGLES)

## 7. Installation
Ã‰tapes concrÃ¨tes

## 8. Tests et DÃ©pannage
Points de contrÃ´le

ðŸ”´ APRÃˆS SECTION 8 : STOP
Ne gÃ©nÃ¨re PAS de contenu supplÃ©mentaire sauf si demandÃ©.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ”„ CONTINUATIONS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

Si "continue" :
1. Identifie derniÃ¨re section gÃ©nÃ©rÃ©e
2. GÃ©nÃ¨re UNIQUEMENT section suivante
3. Si 8 sections faites â†’ "Documentation complÃ¨te"
4. Aucun prÃ©ambule

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸš¨ MERMAID (ZÃ‰RO TOLÃ‰RANCE)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

AUTORISE :
flowchart TD
    NodeA["Label"]
    NodeA --> NodeB

INTERDIT :
- flowchart LR
- Node-ID (tirets)
- Crochets imbriques [A[B[C]]]
- -->|Label| (pipes)

+--------------------------------------------------------+
|  REGLE CRITIQUE : Un seul niveau de crochets [label]  |
|  JAMAIS [NodeA[NodeB]] - utiliser [NodeA_NodeB]        |
+--------------------------------------------------------+

LANGUE : FranÃ§ais uniquement
FORMAT : Markdown concis
`;

const GITHUB_DOC_INSTRUCTION = `
STRUCTURE DE DOCUMENTATION GITHUB :

1. **Vue d'ensemble du projet**
   - Objectif et fonctionnalitÃ©s principales
   - Architecture globale (hardware + software)

2. **Liste des Composants Hardware**
   - Tableau : Composant | Pin ESP32 | Fonction | Notes
   
3. **Configuration des Pins (Code Source)**
   - Extrait des #define ou dÃ©clarations de pins
   - Mapping exact entre pins physiques et logiques

4. **BibliothÃ¨ques et DÃ©pendances**
   - Liste des #include avec leurs rÃ´les

5. **Logique du Code Principal**
   - Ã‰tapes du setup()
   - Cycle de la loop()
   - Fonctions critiques identifiÃ©es

6. **SchÃ©ma de CÃ¢blage (Mermaid)**
   - ReprÃ©sentation graphique du branchement thÃ©orique basÃ© sur le code
   - UTILISE UNIQUEMENT flowchart TD avec IDs alphanumÃ©riques

7. **ProcÃ©dure d'Installation**
   - Configuration IDE (Arduino/PlatformIO)
   - Installation des bibliothÃ¨ques
   - Configuration Wi-Fi/Firebase si applicable
   - Compilation et upload

8. **Tests et DÃ©pannage**
   - Points de contrÃ´le hardware
   - VÃ©rifications Serial Monitor
   - Erreurs courantes et solutions

Ne termine JAMAIS par "CircuitVision Ã  votre service" ou phrases similaires.
Si le code mentionne des credentials (WiFi, API keys), rappelle de les configurer.
`;

// Helper: Extract Arduino code from markdown response for Wokwi simulator
function extractArduinoCode(markdownResponse) {
  // Pattern 1: Code blocks with arduino, cpp, or no language specified
  const codeBlockRegex = /```(?:arduino|cpp)?\n([\s\S]*?)```/g;
  const matches = [...markdownResponse.matchAll(codeBlockRegex)];

  if (matches.length > 0) {
    // Return the first substantial code block (likely the main sketch)
    for (const match of matches) {
      const code = match[1].trim();
      // Skip if it's just documentation or mermaid code
      if (code.length > 100 && !code.startsWith("graph") && !code.startsWith("flowchart")) {
        return code;
      }
    }
    return matches[0][1].trim();
  }

  // Pattern 2: Look for setup/loop patterns
  const setupLoopRegex = /(void\s+setup\s*\(\)[\s\S]*?void\s+loop\s*\([\s\S]*?\})/g;
  const setupMatch = markdownResponse.match(setupLoopRegex);
  if (setupMatch) {
    return setupMatch[1];
  }

  // Pattern 3: Look for Arduino-specific keywords
  const arduinoKeywords = ["#include <Arduino.h>", "Serial.begin", "pinMode", "digitalWrite"];
  for (const keyword of arduinoKeywords) {
    const idx = markdownResponse.indexOf(keyword);
    if (idx !== -1) {
      // Extract ~500 chars around the keyword
      const start = Math.max(0, idx - 100);
      const end = Math.min(markdownResponse.length, idx + 500);
      return markdownResponse.substring(start, end);
    }
  }

  // Fallback: Return empty or try to extract from githubContext directly
  return "";
}

export async function POST(req) {
  try {
    //  RATE LIMITING CHECK
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const rateLimit = checkRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Trop de requÃªtes. RÃ©essaie dans ${rateLimit.waitTime}s` },
        { status: 429, headers: { "Retry-After": rateLimit.waitTime.toString() } }
      );
    }

    // Parse JSON avec gestion d'erreur
    let data;
    try {
      data = await req.json();
    } catch (jsonError) {
      return NextResponse.json(
        { error: "Format JSON invalide. VÃ©rifiez votre requÃªte." },
        { status: 400 }
      );
    }

    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "DonnÃ©es de requÃªte manquantes." }, { status: 400 });
    }

    const {
      referenceFiles,
      realityFiles,
      files,
      input,
      isCompare,
      sessionId,
      history,
      enableStreaming = false,
      userLanguage = "en",
    } = data;

    console.log("=== API ANALYZE ===");
    console.log("referenceFiles:", referenceFiles?.length, "items");
    console.log("realityFiles:", realityFiles?.length, "items");
    console.log("files:", files?.length, "items");
    console.log("isCompare:", isCompare);
    console.log("input:", input?.substring(0, 1000));

    const promptParts = [];

    const hasGithub = input?.includes("github.com");
    const hasMedia = files?.length > 0 || realityFiles?.length > 0 || referenceFiles?.length > 0;

    console.log("hasGithub:", hasGithub, "hasMedia:", hasMedia);

    let githubUrl = null;
    let githubContext = "";

    // ðŸ†• Ã‰TAPE 1 : SCAN GITHUB + ANALYSE HARDWARE
    if (hasGithub) {
      githubUrl = extractGithubUrl(input);
      if (githubUrl) {
        githubContext = await getRepoContent(githubUrl);

        if (githubContext) {
          promptParts.push({
            text: `ðŸ“‚ CODE SOURCE DU PROJET GITHUB :\n\`\`\`\n${githubContext}\n\`\`\``,
          });
          promptParts.push({ text: GITHUB_DOC_INSTRUCTION });

          // ðŸ†• ANALYSE HARDWARE AUTOMATIQUE
          const hardwareAnalysis = analyzeHardwareCode(githubContext);

          if (hardwareAnalysis.bugs.length > 0) {
            const criticalBugs = hardwareAnalysis.bugs.filter((b) => b.severity === "critical");
            const warnings = hardwareAnalysis.bugs.filter((b) => b.severity === "warning");

            promptParts.push({
              text: `\n BUGS HARDWARE DÃ‰TECTÃ‰S AUTOMATIQUEMENT :\n${hardwareAnalysis.bugs.length} bugs trouvÃ©s (${criticalBugs.length} critiques, ${warnings.length} avertissements)\n\nIntÃ¨gre ces bugs dans ta section "Tests et DÃ©pannage" avec leurs solutions.`,
            });
          }

          // ✅ GÉNÉRATION SHOPPING LIST with Google Search
          if (githubContext) {
            const components = extractComponentsFromCode(githubContext);

            if (components.length > 0) {
              console.log(`🛒 Searching prices for ${components.length} components...`);

              // ✅ Call Google Search via Gemini 3
              const shoppingResult = await searchComponentPrices(components, userLanguage);

              if (shoppingResult.success && shoppingResult.items) {
                // ✅ CORRECTED: Use proper markdown generation with links
                const { generateShoppingMarkdown } = await import("@/lib/component-search");
                const shoppingMarkdown = generateShoppingMarkdown(
                  shoppingResult.items,
                  userLanguage
                );

                console.log("✅ Shopping list markdown generated with purchase links");

                // ✅ Add to prompt for inclusion in documentation
                promptParts.push({
                  text: `\n\n${shoppingMarkdown}\n\n⚠️ IMPORTANT: Include this EXACT shopping list in your documentation. DO NOT regenerate it. Copy it as-is with all links and prices.\n`,
                });

                // ✅ Log sample for verification
                console.log("📋 Sample shopping list:", shoppingMarkdown.substring(0, 300));
              } else {
                // Fallback without prices
                console.warn("⚠️ Google Search failed, using component list without prices");
                promptParts.push({
                  text: `\nCOMPONENTS DETECTED: ${components.join(", ")}\n\nCreate a "Shopping List" section with these components.`,
                });
              }
            }
          }

          // ðŸ†• DÃ‰TECTION PLATEFORME
          const platformInfo = detectPlatformType(githubContext, [
            "main.cpp",
            "platformio.ini",
            "sketch.ino",
          ]);
          if (platformInfo.platform !== "unknown") {
            promptParts.push({
              text: `\nðŸŽ¯ PLATEFORME DÃ‰TECTÃ‰E : ${platformInfo.type} (${platformInfo.platform}) - Confiance: ${platformInfo.confidence}\n\nAdapte ta documentation pour cette plateforme.`,
            });
          }
        }
      }
    }

    // CONTEXTE SELON MEDIA
    if (hasGithub && !hasMedia) {
      promptParts.push({
        text: `ðŸŽ¯ CONTEXTE : Tu as reÃ§u UNIQUEMENT du code source GitHub. Aucune image/vidÃ©o n'est fournie. Concentre-toi sur l'analyse du code.`,
      });
    } else if (!hasGithub && hasMedia) {
      promptParts.push({
        text: `ðŸŽ¯ CONTEXTE : Tu as reÃ§u UNIQUEMENT des images/vidÃ©os. Aucun code GitHub n'est fourni. Analyse le mÃ©dia visuel.`,
      });
    } else if (hasGithub && hasMedia) {
      promptParts.push({
        text: `ðŸŽ¯ CONTEXTE : Tu as reÃ§u BOTH code GitHub ET mÃ©dia visuel. Compare-les pour identifier les diffÃ©rences.`,
      });
    }

    // Helper: Fetch image from URL and convert to base64
    async function fetchImageAsBase64(url) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = blob.type || "image/jpeg";
        return { base64, mimeType };
      } catch (err) {
        console.error("Erreur fetch image:", err);
        return null;
      }
    }
    // ✅ HELPER FUNCTION: Calculate total
    function calculateTotal(items) {
      if (!items || items.length === 0) return "0.00";
      const sum = items.reduce((acc, item) => {
        const price = parseFloat(item.price_usd);
        return acc + (isNaN(price) ? 0 : price);
      }, 0);
      return sum.toFixed(2);
    }

    // MODE COMPARAISON
    if (isCompare) {
      if (referenceFiles?.length > 0) {
        promptParts.push({ text: "ðŸ“‹ DOCUMENTS DE RÃ‰FÃ‰RENCE (SCHÃ‰MA/CODE):" });
        for (const f of referenceFiles) {
          if (f.url) {
            const imgData = await fetchImageAsBase64(f.url);
            if (imgData) {
              promptParts.push({
                inlineData: { mimeType: imgData.mimeType, data: imgData.base64 },
              });
            } else {
              promptParts.push({ text: `ðŸ“Ž Fichier: ${f.url}` });
            }
          } else if (f.data) {
            promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
          }
        }
      }

      if (realityFiles?.length > 0) {
        promptParts.push({ text: "ðŸ“¸ RÃ‰ALITÃ‰ DU MONTAGE (PHOTOS/VIDÃ‰OS):" });
        for (const f of realityFiles) {
          if (f.url) {
            const imgData = await fetchImageAsBase64(f.url);
            if (imgData) {
              promptParts.push({
                inlineData: { mimeType: imgData.mimeType, data: imgData.base64 },
              });
            } else {
              promptParts.push({ text: `ðŸ“Ž Fichier: ${f.url}` });
            }
          } else if (f.data) {
            promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
          }
        }
      }

      promptParts.push({
        text: `â“ QUESTION : ${input}`,
      });
    } else {
      promptParts.push({
        text: `â“ QUESTION : ${input || "Fournis une analyse technique complÃ¨te."}`,
      });

      // Handle both URL format and base64 format
      const media = referenceFiles?.length > 0 ? referenceFiles : files || realityFiles || [];
      for (const f of media) {
        if (f.url) {
          // URL format - fetch and convert to base64
          const imgData = await fetchImageAsBase64(f.url);
          if (imgData) {
            promptParts.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.base64 } });
          } else {
            promptParts.push({ text: `ðŸ“Ž MÃ©dia: ${f.url}` });
          }
        } else if (f.data) {
          // Base64 format
          promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
        }
      }
    }

    // ðŸ†• CHOIX DU MODE : STREAMING OU STRUCTURED OUTPUT
    const useStructuredOutput = hasGithub && !enableStreaming; // Structured output pour GitHub sans streaming

    let aiResponse = "";
    const modelsToTry = [
      "gemini-3-flash-preview", //instable
      "gemini-3-pro-preview", //instable
      "gemini-2.5-flash-lite", // Stable + Ã©conomique
      "gemini-2.5-flash", // Stable + rapide
      "gemini-2.5-pro", // Stable + puissant
    ];

    const isRefinement = sessionId?.includes("refinement-");
    const isContinuation = input?.includes("CONTINUE LA DOCUMENTATION");

    const maxTokens = isContinuation ? 6000 : isRefinement ? 8000 : 6000;

    for (const currentModelName of modelsToTry) {
      try {
        console.log(`ðŸ”„ Tentative avec: ${currentModelName}`);

        const modelConfig = {
          model: currentModelName,
          systemInstruction: buildSystemInstruction(userLanguage),
        };

        // ðŸ†• AJOUTER STRUCTURED OUTPUT SI APPLICABLE
        if (useStructuredOutput && hasGithub) {
          console.log("📋 Using structured output for GitHub analysis");
          modelConfig.generationConfig = {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(DocumentationSchema),
            maxOutputTokens: maxTokens,
            temperature: 0.3,
          };
        }

        const model = genAI.getGenerativeModel(modelConfig);

        // Nettoyer l'historique
        const cleanHistory = (history || [])
          .map((msg) => {
            if (msg.role === "assistant" || msg.role === "ai") {
              return { ...msg, role: "model" };
            }
            if (msg.role === "user") {
              return msg;
            }
            return null;
          })
          .filter(Boolean);

        // S'assurer que le premier message est 'user'
        if (cleanHistory.length > 0 && cleanHistory[0].role !== "user") {
          console.warn("âš ï¸ Premier message n'est pas user, historique ignorÃ©");
          cleanHistory.length = 0;
        }

        const chatConfig = {
          history: cleanHistory,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.3,
          },
        };

        const chat = model.startChat(chatConfig);
        // REMPLACER la section streaming (ligne 325-390) dans src/app/api/analyze/route.js

        if (enableStreaming) {
          // MODE STREAMING SSE
          const encoder = new TextEncoder();

          const stream = new ReadableStream({
            async start(controller) {
              try {
                // 1. Envoyer status initial
                controller.enqueue(
                  encoder.encode(
                    `event: status\ndata: ${JSON.stringify({ message: "Analyse en cours..." })}\n\n`
                  )
                );

                // 2. Analyser et envoyer bugs si GitHub
                if (githubContext) {
                  const hardwareAnalysis = analyzeHardwareCode(githubContext);
                  if (hardwareAnalysis.bugs.length > 0) {
                    controller.enqueue(
                      encoder.encode(
                        `event: bugs_detected\ndata: ${JSON.stringify({
                          bugs: hardwareAnalysis.bugs,
                          stats: hardwareAnalysis.stats,
                        })}\n\n`
                      )
                    );
                  }

                  const components = extractComponentsFromCode(githubContext);
                  if (components.length > 0) {
                    console.log(`🛒 Streaming: Found ${components.length} components`);

                    const shoppingResult = await searchComponentPrices(components, userLanguage);

                    if (shoppingResult.success && shoppingResult.items) {
                      controller.enqueue(
                        encoder.encode(
                          `event: shopping_list\ndata: ${JSON.stringify({
                            items: shoppingResult.items,
                            total_usd: calculateTotal(shoppingResult.items),
                          })}\n\n`
                        )
                      );
                    }
                  }
                }

                // 3. Stream Gemini response
                const result = await chat.sendMessageStream(promptParts);
                let fullResponse = "";

                for await (const chunk of result.stream) {
                  const chunkText = chunk.text();
                  fullResponse += chunkText;

                  // Envoyer chunk (pas d'event, juste data)
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: chunkText })}\n\n`)
                  );
                }

                // 4. Post-traitement Mermaid
                const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
                fullResponse = fullResponse.replace(mermaidRegex, (match, code) => {
                  const sanitized = sanitizeMermaidCode(code);
                  return sanitized ? `\`\`\`mermaid\n${sanitized}\n\`\`\`` : match;
                });

                // 5. Envoyer completion event
                // Extraire le code Arduino pour le simulateur
                const arduinoCode = extractArduinoCode(fullResponse);

                controller.enqueue(
                  encoder.encode(
                    `event: complete\ndata: ${JSON.stringify({
                      analysis: fullResponse,
                      githubUrl: githubUrl,
                      arduinoCode: arduinoCode, // Code Arduino pur pour Wokwi
                      metadata: {
                        bugsFound: githubContext
                          ? analyzeHardwareCode(githubContext).bugs.length
                          : 0,
                        componentsFound: githubContext
                          ? extractComponentsFromCode(githubContext).length
                          : 0,
                        platform: githubContext
                          ? detectPlatformType(githubContext).type
                          : "unknown",
                      },
                    })}\n\n`
                  )
                );

                // 6. Sauvegarder Firestore (async, ne bloque pas)
                addDoc(collection(db, "chats"), {
                  sessionId: sessionId || "anonyme",
                  type: isCompare ? "audit" : "simple",
                  userQuery: input,
                  aiResponse: fullResponse,
                  hasGithubUrl: !!githubUrl,
                  githubUrl: githubUrl,
                  bugsDetected: githubContext ? analyzeHardwareCode(githubContext).stats : null,
                  componentsCount: githubContext
                    ? extractComponentsFromCode(githubContext).length
                    : 0,
                  createdAt: serverTimestamp(),
                }).catch(console.error);

                controller.close();
              } catch (err) {
                console.error("❌ Stream error:", err);
                controller.enqueue(
                  encoder.encode(
                    `event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`
                  )
                );
                controller.error(err);
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no", // Nginx unbuffering
            },
          });
        } else {
          // MODE NORMAL (JSON) - continue jusqu'à la fin de la fonction
          const result = await chat.sendMessage(promptParts);
          aiResponse = result.response.text();
        }

        if (aiResponse) {
          console.log(`âœ… SuccÃ¨s avec: ${currentModelName}`);
          break;
        }
      } catch (error) {
        console.error(`âŒ Ã‰chec avec ${currentModelName}:`, error.message);
        lastError = error;

        if (error.status === 429 || error.status === 503) {
          await delay(2000);
          continue;
        }
        break;
      }
    }

    if (!aiResponse) {
      aiResponse =
        "âš ï¸ CapacitÃ© d'analyse temporairement limitÃ©e. RÃ©essayez dans quelques instants.";
    }

    // POST-TRAITEMENT : Validation et correction Mermaid
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
    aiResponse = aiResponse.replace(mermaidRegex, (match, code) => {
      const sanitized = sanitizeMermaidCode(code);
      return sanitized ? `\`\`\`mermaid\n${sanitized}\n\`\`\`` : match;
    });

    // Sauvegarde Firestore avec metadata enrichie
    addDoc(collection(db, "chats"), {
      sessionId: sessionId || "anonyme",
      type: isCompare ? "audit" : "simple",
      userQuery: input,
      aiResponse: aiResponse,
      hasGithubUrl: !!githubUrl,
      githubUrl: githubUrl,
      // ðŸ†• METADATA SUPPLÃ‰MENTAIRE
      bugsDetected: githubContext ? analyzeHardwareCode(githubContext).stats : null,
      componentsCount: githubContext ? extractComponentsFromCode(githubContext).length : 0,
      createdAt: serverTimestamp(),
    }).catch(console.error);

    // Extraire le code Arduino pour le simulateur
    const arduinoCode = extractArduinoCode(aiResponse);

    return NextResponse.json({
      analysis: aiResponse,
      githubUrl: githubUrl,
      arduinoCode: arduinoCode, // Code Arduino pur pour Wokwi
      // ðŸ†• DONNÃ‰ES SUPPLÃ‰MENTAIRES POUR LE FRONTEND
      metadata: {
        bugsFound: githubContext ? analyzeHardwareCode(githubContext).bugs.length : 0,
        componentsFound: githubContext ? extractComponentsFromCode(githubContext).length : 0,
        platform: githubContext ? detectPlatformType(githubContext).type : "unknown",
      },
    });
  } catch (error) {
    console.error("ERREUR:", error);
    return NextResponse.json({ error: "Erreur technique." }, { status: 500 });
  }
}
