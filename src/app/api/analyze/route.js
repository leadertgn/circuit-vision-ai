import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase";
import { getRepoContent } from "@/lib/github";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { NextResponse } from "next/server";
import { sanitizeMermaidCode } from "@/lib/mermaid-validator";
import { extractGithubUrl } from "@/lib/doc-completion-detector";

export const maxDuration = 60;
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const SYSTEM_INSTRUCTION = `
Tu es CircuitVision AI, Expert en Systèmes Embarqués.

═══════════════════════════════════════════════════════════════
🎯 RÈGLE ABSOLUE : RESTE FOCALISÉ SUR LE CODE FOURNI
═══════════════════════════════════════════════════════════════

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
    const data = await req.json();
    const { referenceFiles, realityFiles, files, input, isCompare, sessionId, history } = data;

    const promptParts = [];
    
    const hasGithub = input.includes("github.com");
    const hasMedia = (files?.length > 0) || (realityFiles?.length > 0) || (referenceFiles?.length > 0);

    let githubUrl = null;
    let githubContext = "";
    
    if (hasGithub) {
      githubUrl = extractGithubUrl(input);
      if (githubUrl) {
        githubContext = await getRepoContent(githubUrl);
        
        if (githubContext) {
          promptParts.push({ 
            text: `📂 CODE SOURCE DU PROJET GITHUB :\n\`\`\`\n${githubContext}\n\`\`\`` 
          });
          promptParts.push({ text: GITHUB_DOC_INSTRUCTION });
        }
      }
    }

    if (hasGithub && !hasMedia) {
      promptParts.push({ 
        text: `🎯 CONTEXTE : Tu as reçu UNIQUEMENT du code source GitHub. Aucune image/vidéo n'est fournie. Concentre-toi sur l'analyse du code.` 
      });
    } else if (!hasGithub && hasMedia) {
      promptParts.push({ 
        text: `🎯 CONTEXTE : Tu as reçu UNIQUEMENT des images/vidéos. Aucun code GitHub n'est fourni. Analyse le média visuel.` 
      });
    } else if (hasGithub && hasMedia) {
      promptParts.push({ 
        text: `🎯 CONTEXTE : Tu as reçu BOTH code GitHub ET média visuel. Compare-les pour identifier les différences.` 
      });
    }

    if (isCompare) {
      promptParts.push({ text: "MODE: AUDIT COMPARATIF\n" });

      if (referenceFiles?.length > 0) {
        promptParts.push({ text: "📋 DOCUMENTS DE RÉFÉRENCE (SCHÉMA/CODE):" });
        referenceFiles.forEach((f) => {
          promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
        });
      }

      if (realityFiles?.length > 0) {
        promptParts.push({ text: "📸 RÉALITÉ DU MONTAGE (PHOTOS/VIDÉOS):" });
        realityFiles.forEach((f) => {
          promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
        });
      }

      promptParts.push({
        text: `❓ QUESTION : ${input}`,
      });
    } else {
      promptParts.push({
        text: `❓ QUESTION : ${input || "Fournis une analyse technique complète."}`,
      });
      
      const media = files || realityFiles || [];
      media.forEach((f) => {
        promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
      });
    }

    let aiResponse = "";
    const modelsToTry = [
      "gemini-3-pro-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ];

    const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
    let lastError = null;

    const isRefinement = sessionId?.includes("refinement-");
    const isContinuation = input.includes("CONTINUE LA DOCUMENTATION");
    
    // CORRECTION : Réduire les tokens pour éviter timeouts et répétitions
    // 6000 tokens = ~4500 mots = largement suffisant pour une section
    const maxTokens = isContinuation ? 6000 : (isRefinement ? 8000 : 6000);

    for (const currentModelName of modelsToTry) {
      try {
        console.log(`🔄 Tentative avec: ${currentModelName}`);
        const model = genAI.getGenerativeModel({
          model: currentModelName,
          systemInstruction: SYSTEM_INSTRUCTION,
        });

        // CORRECTION : Nettoyer l'historique pour éviter l'erreur "First content should be with role 'user'"
        const cleanHistory = (history || []).map(msg => {
          // Gemini attend 'user' ou 'model', pas 'assistant' ou 'ai'
          if (msg.role === 'assistant' || msg.role === 'ai') {
            return { ...msg, role: 'model' };
          }
          if (msg.role === 'user') {
            return msg;
          }
          // Ignorer les rôles invalides
          return null;
        }).filter(Boolean);

        // S'assurer que le premier message est toujours 'user'
        if (cleanHistory.length > 0 && cleanHistory[0].role !== 'user') {
          console.warn('⚠️ Premier message n\'est pas user, historique ignoré');
          cleanHistory.length = 0;
        }

        const chat = model.startChat({
          history: cleanHistory,
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
        });

        const result = await chat.sendMessage(promptParts);
        aiResponse = result.response.text();

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
      aiResponse = "⚠️ Capacité d'analyse temporairement limitée. Réessayez dans quelques instants.";
    }

    // POST-TRAITEMENT : Validation et correction Mermaid
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
    aiResponse = aiResponse.replace(mermaidRegex, (match, code) => {
      const sanitized = sanitizeMermaidCode(code);
      return sanitized ? `\`\`\`mermaid\n${sanitized}\n\`\`\`` : match;
    });

    // Sauvegarde Firestore avec metadata
    addDoc(collection(db, "chats"), {
      sessionId: sessionId || "anonyme",
      type: isCompare ? "audit" : "simple",
      userQuery: input,
      aiResponse: aiResponse,
      hasGithubUrl: !!githubUrl,
      githubUrl: githubUrl,
      createdAt: serverTimestamp(),
    }).catch(console.error);

    return NextResponse.json({ 
      analysis: aiResponse,
      githubUrl: githubUrl, // Pour le frontend
    });
  } catch (error) {
    console.error("ERREUR:", error);
    return NextResponse.json({ error: "Erreur technique." }, { status: 500 });
  }
}