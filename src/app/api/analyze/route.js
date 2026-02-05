import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase";
import { getRepoContent } from "@/lib/github";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { NextResponse } from "next/server";
import { sanitizeMermaidCode } from "@/lib/mermaid-validator";
import { extractGithubUrl } from "@/lib/doc-completion-detector";
import { analyzeHardwareCode } from "@/lib/hardware-validator";
import { extractComponentsFromCode } from "@/lib/component-search";
import { detectPlatformType } from "@/lib/platform-support";
import { z } from "zod";

// Server-side API key only
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const maxDuration = 60;
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// 🚨 RATE LIMITING SIMPLE (en mémoire)
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

const SYSTEM_INSTRUCTION = `
Tu es CircuitVision AI, Expert en Systèmes Embarqués.

Tu peux analyser:
1. DU CODE SOURCE (Arduino, ESP32, etc.)
2. DES IMAGES de circuits PCB
3. DES VIDÉOS de montages

Pour les IMAGES/VIDÉOS:
- Décris les composants visibles
- Propose un schéma de câblage
- Demande le code si disponible


❌ NE JAMAIS :
- Inventer des informations non présentes dans le code
- Parler de composants non mentionnés dans le code
- Spéculer sur l'architecture si pas évident
- Générer plusieurs versions de la même chose
- Te répéter ou régénérer du contenu déjà écrit

✅ TOUJOURS :
- Analyser UNIQUEMENT le code source fourni
- Rester factuel et précis
- Citer les fichiers et lignes de code
- Être concis et direct

═══════════════════════════════════════════════════════════════
📋 STRUCTURE OBLIGATOIRE (8 SECTIONS MAX)
═══════════════════════════════════════════════════════════════

Pour un projet GitHub, génère EXACTEMENT ces sections :

## 1. Vue d'ensemble
Objectif (2-3 phrases) + Architecture

## 2. Composants Hardware
Tableau : Composant | Pin | Fonction | Notes

## 3. Configuration des Pins
Code extrait avec #define

## 4. Bibliothèques
Liste #include avec rôles

## 5. Logique du Code
setup(), loop(), fonctions critiques

## 6. Schéma de Câblage
Diagramme Mermaid (RESPECTE RÈGLES)

## 7. Installation
Étapes concrètes

## 8. Tests et Dépannage
Points de contrôle

🔴 APRÈS SECTION 8 : STOP
Ne génère PAS de contenu supplémentaire sauf si demandé.

═══════════════════════════════════════════════════════════════
🔄 CONTINUATIONS
═══════════════════════════════════════════════════════════════

Si "continue" :
1. Identifie dernière section générée
2. Génère UNIQUEMENT section suivante
3. Si 8 sections faites → "Documentation complète"
4. Aucun préambule

═══════════════════════════════════════════════════════════════
🚨 MERMAID (ZÉRO TOLÉRANCE)
═══════════════════════════════════════════════════════════════

AUTORISÉ :
flowchart TD
    NodeID["Label"]
    NodeID --> NodeID2

INTERDIT :
❌ flowchart LR
❌ Node-ID (tirets/espaces)
❌ Node(Label) (parenthèses)
❌ -->|Label| (pipes)
❌ note right of (notes)

LANGUE : Français uniquement
FORMAT : Markdown concis
`;

const GITHUB_DOC_INSTRUCTION = `
STRUCTURE DE DOCUMENTATION GITHUB :

1. **Vue d'ensemble du projet**
   - Objectif et fonctionnalités principales
   - Architecture globale (hardware + software)

2. **Liste des Composants Hardware**
   - Tableau : Composant | Pin ESP32 | Fonction | Notes
   
3. **Configuration des Pins (Code Source)**
   - Extrait des #define ou déclarations de pins
   - Mapping exact entre pins physiques et logiques

4. **Bibliothèques et Dépendances**
   - Liste des #include avec leurs rôles

5. **Logique du Code Principal**
   - Étapes du setup()
   - Cycle de la loop()
   - Fonctions critiques identifiées

6. **Schéma de Câblage (Mermaid)**
   - Représentation graphique du branchement théorique basé sur le code
   - UTILISE UNIQUEMENT flowchart TD avec IDs alphanumériques

7. **Procédure d'Installation**
   - Configuration IDE (Arduino/PlatformIO)
   - Installation des bibliothèques
   - Configuration Wi-Fi/Firebase si applicable
   - Compilation et upload

8. **Tests et Dépannage**
   - Points de contrôle hardware
   - Vérifications Serial Monitor
   - Erreurs courantes et solutions

Ne termine JAMAIS par "CircuitVision à votre service" ou phrases similaires.
Si le code mentionne des credentials (WiFi, API keys), rappelle de les configurer.
`;

export async function POST(req) {
  try {
    // 🚨 RATE LIMITING CHECK
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const rateLimit = checkRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Trop de requêtes. Réessaie dans ${rateLimit.waitTime}s` },
        { status: 429, headers: { "Retry-After": rateLimit.waitTime.toString() } }
      );
    }

    // Parse JSON avec gestion d'erreur
    let data;
    try {
      data = await req.json();
    } catch (jsonError) {
      return NextResponse.json(
        { error: "Format JSON invalide. Vérifiez votre requête." },
        { status: 400 }
      );
    }

    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Données de requête manquantes." }, { status: 400 });
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

    // 🆕 ÉTAPE 1 : SCAN GITHUB + ANALYSE HARDWARE
    if (hasGithub) {
      githubUrl = extractGithubUrl(input);
      if (githubUrl) {
        githubContext = await getRepoContent(githubUrl);

        if (githubContext) {
          promptParts.push({
            text: `📂 CODE SOURCE DU PROJET GITHUB :\n\`\`\`\n${githubContext}\n\`\`\``,
          });
          promptParts.push({ text: GITHUB_DOC_INSTRUCTION });

          // 🆕 ANALYSE HARDWARE AUTOMATIQUE
          const hardwareAnalysis = analyzeHardwareCode(githubContext);

          if (hardwareAnalysis.bugs.length > 0) {
            const criticalBugs = hardwareAnalysis.bugs.filter((b) => b.severity === "critical");
            const warnings = hardwareAnalysis.bugs.filter((b) => b.severity === "warning");

            promptParts.push({
              text: `\n🐛 BUGS HARDWARE DÉTECTÉS AUTOMATIQUEMENT :\n${hardwareAnalysis.bugs.length} bugs trouvés (${criticalBugs.length} critiques, ${warnings.length} avertissements)\n\nIntègre ces bugs dans ta section "Tests et Dépannage" avec leurs solutions.`,
            });
          }

          // 🆕 GÉNÉRATION SHOPPING LIST
          const components = extractComponentsFromCode(githubContext);
          if (components.length > 0) {
            promptParts.push({
              text: `\n🛒 COMPOSANTS DÉTECTÉS : ${components.join(", ")}\n\nCrée une section "Shopping List" avec ces composants.`,
            });
          }

          // 🆕 DÉTECTION PLATEFORME
          const platformInfo = detectPlatformType(githubContext, [
            "main.cpp",
            "platformio.ini",
            "sketch.ino",
          ]);
          if (platformInfo.platform !== "unknown") {
            promptParts.push({
              text: `\n🎯 PLATEFORME DÉTECTÉE : ${platformInfo.type} (${platformInfo.platform}) - Confiance: ${platformInfo.confidence}\n\nAdapte ta documentation pour cette plateforme.`,
            });
          }
        }
      }
    }

    // CONTEXTE SELON MEDIA
    if (hasGithub && !hasMedia) {
      promptParts.push({
        text: `🎯 CONTEXTE : Tu as reçu UNIQUEMENT du code source GitHub. Aucune image/vidéo n'est fournie. Concentre-toi sur l'analyse du code.`,
      });
    } else if (!hasGithub && hasMedia) {
      promptParts.push({
        text: `🎯 CONTEXTE : Tu as reçu UNIQUEMENT des images/vidéos. Aucun code GitHub n'est fourni. Analyse le média visuel.`,
      });
    } else if (hasGithub && hasMedia) {
      promptParts.push({
        text: `🎯 CONTEXTE : Tu as reçu BOTH code GitHub ET média visuel. Compare-les pour identifier les différences.`,
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

    // MODE COMPARAISON
    if (isCompare) {
      if (referenceFiles?.length > 0) {
        promptParts.push({ text: "📋 DOCUMENTS DE RÉFÉRENCE (SCHÉMA/CODE):" });
        for (const f of referenceFiles) {
          if (f.url) {
            const imgData = await fetchImageAsBase64(f.url);
            if (imgData) {
              promptParts.push({
                inlineData: { mimeType: imgData.mimeType, data: imgData.base64 },
              });
            } else {
              promptParts.push({ text: `📎 Fichier: ${f.url}` });
            }
          } else if (f.data) {
            promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
          }
        }
      }

      if (realityFiles?.length > 0) {
        promptParts.push({ text: "📸 RÉALITÉ DU MONTAGE (PHOTOS/VIDÉOS):" });
        for (const f of realityFiles) {
          if (f.url) {
            const imgData = await fetchImageAsBase64(f.url);
            if (imgData) {
              promptParts.push({
                inlineData: { mimeType: imgData.mimeType, data: imgData.base64 },
              });
            } else {
              promptParts.push({ text: `📎 Fichier: ${f.url}` });
            }
          } else if (f.data) {
            promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
          }
        }
      }

      promptParts.push({
        text: `❓ QUESTION : ${input}`,
      });
    } else {
      promptParts.push({
        text: `❓ QUESTION : ${input || "Fournis une analyse technique complète."}`,
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
            promptParts.push({ text: `📎 Média: ${f.url}` });
          }
        } else if (f.data) {
          // Base64 format
          promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
        }
      }
    }

    // 🆕 CHOIX DU MODE : STREAMING OU STRUCTURED OUTPUT
    const useStructuredOutput = hasGithub && !enableStreaming; // Structured output pour GitHub sans streaming

    let aiResponse = "";
    // Modèles Gemini 2.5 (stables pour démo)
    const modelsToTry = [
      "gemini-2.5-flash", // Stable + rapide
      "gemini-2.5-flash-lite", // Stable + économique
      "gemini-2.5-pro", // Stable + puissant
    ];

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    let lastError = null;

    const isRefinement = sessionId?.includes("refinement-");
    const isContinuation = input.includes("CONTINUE LA DOCUMENTATION");

    const maxTokens = isContinuation ? 6000 : isRefinement ? 8000 : 6000;

    for (const currentModelName of modelsToTry) {
      try {
        console.log(`🔄 Tentative avec: ${currentModelName}`);

        const modelConfig = {
          model: currentModelName,
          systemInstruction: SYSTEM_INSTRUCTION,
        };

        // 🆕 AJOUTER STRUCTURED OUTPUT SI APPLICABLE
        if (useStructuredOutput && hasGithub) {
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
          console.warn("⚠️ Premier message n'est pas user, historique ignoré");
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

        // 🆕 GESTION STREAMING SSE OU NORMAL
        if (enableStreaming) {
          // MODE STREAMING SSE
          const encoder = new TextEncoder();

          const stream = new ReadableStream({
            async start(controller) {
              try {
                const result = await chat.sendMessageStream(promptParts);
                let fullResponse = "";

                // Envoyer l'événement initial
                controller.enqueue(
                  encoder.encode(
                    `event: status\ndata: ${JSON.stringify({ status: "Analyse en cours..." })}\n\n`
                  )
                );

                // Analyser et envoyer les bugs détectés
                if (githubContext) {
                  const hardwareAnalysis = analyzeHardwareCode(githubContext);
                  if (hardwareAnalysis.bugs.length > 0) {
                    controller.enqueue(
                      encoder.encode(
                        `event: bugs_detected\ndata: ${JSON.stringify(hardwareAnalysis)}\n\n`
                      )
                    );
                  }

                  const components = extractComponentsFromCode(githubContext);
                  if (components.length > 0) {
                    const shoppingList = {
                      success: true,
                      items: components.map((comp) => ({
                        component: comp,
                        quantity: 1,
                        estimated_price: "À rechercher",
                        purchase_links: [],
                        alternatives: [],
                      })),
                    };
                    controller.enqueue(
                      encoder.encode(
                        `event: shopping_list\ndata: ${JSON.stringify(shoppingList)}\n\n`
                      )
                    );
                  }
                }

                // Stream des chunks
                for await (const chunk of result.stream) {
                  const chunkText = chunk.text();
                  fullResponse += chunkText;
                  // Envoyer chaque chunk comme données SSE
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: chunkText })}\n\n`)
                  );
                }

                // Post-traitement Mermaid
                const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
                fullResponse = fullResponse.replace(mermaidRegex, (match, code) => {
                  const sanitized = sanitizeMermaidCode(code);
                  return sanitized ? `\`\`\`mermaid\n${sanitized}\n\`\`\`` : match;
                });

                // Envoyer l'événement de completion
                const completionData = {
                  analysis: fullResponse,
                  githubUrl: githubUrl,
                  metadata: {
                    bugsFound: githubContext ? analyzeHardwareCode(githubContext).bugs.length : 0,
                    componentsFound: githubContext
                      ? extractComponentsFromCode(githubContext).length
                      : 0,
                    platform: githubContext ? detectPlatformType(githubContext).type : "unknown",
                  },
                };

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ ...completionData, event: "complete" })}\n\n`
                  )
                );

                // Sauvegarder dans Firestore en arrière-plan (ne pas bloquer le stream)
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
                controller.error(err);
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        } else {
          // MODE NORMAL (JSON) - continue jusqu'à la fin de la fonction
          const result = await chat.sendMessage(promptParts);
          aiResponse = result.response.text();
        }

        if (aiResponse) {
          console.log(`✅ Succès avec: ${currentModelName}`);
          break;
        }
      } catch (error) {
        console.error(`❌ Échec avec ${currentModelName}:`, error.message);
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
        "⚠️ Capacité d'analyse temporairement limitée. Réessayez dans quelques instants.";
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
      // 🆕 METADATA SUPPLÉMENTAIRE
      bugsDetected: githubContext ? analyzeHardwareCode(githubContext).stats : null,
      componentsCount: githubContext ? extractComponentsFromCode(githubContext).length : 0,
      createdAt: serverTimestamp(),
    }).catch(console.error);

    return NextResponse.json({
      analysis: aiResponse,
      githubUrl: githubUrl,
      // 🆕 DONNÉES SUPPLÉMENTAIRES POUR LE FRONTEND
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
