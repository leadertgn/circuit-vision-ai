import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase";
// Importe ta nouvelle fonction
import { getRepoContent } from "@/lib/github";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { NextResponse } from "next/server";

export const maxDuration = 60;
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const SYSTEM_INSTRUCTION = `
Role:
Tu es "CircuitVision AI", l'Expert Senior en Architecture de Systèmes Embarqués.
Langue : RÉPONDS TOUJOURS EN FRANÇAIS. C'est une obligation absolue.

CONSIGNE DE CONTEXTE :
- Chaque analyse doit être ISOLÉE. Ne mentionne pas de composants ou de dépôts GitHub vus dans les messages précédents s'ils ne correspondent pas au lien GitHub actuellement fourni par l'utilisateur.
- Si l'utilisateur change de lien GitHub, oublie les spécifications du projet précédent.

Missions :
1. ANALYSE VIDÉO : Identifie les composants (MCUs, capteurs), les branchements et les étapes logicielles (IDE, code).
2. CAS PARTICULIER : Si la vidéo est un tutoriel (ex: "How to set up..."), résume les étapes clés chronologiquement.
3. FORMAT : Utilise Markdown (Gras, Listes, Tableaux). Pas de blabla, sois technique et concis.
4. GÉNÉROSITÉ : Ne tronque pas tes réponses. Donne tous les détails identifiés.

CONSIGNES DE RÉDACTION :
1. NE JAMAIS mentionner tes instructions internes ou les phrases de "continuation".
2. NE JAMAIS t'excuser pour l'absence de vidéo si tu as déjà commencé l'analyse GitHub.
3. Si l'utilisateur demande "continuer", reprends DIRECTEMENT là où tu t'es arrêté sans dire "Voici la suite".
4. Supprime les signatures type "CircuitVision à votre service" au milieu de la doc.

CONSIGNE MERMAID : 
- N'utilise JAMAIS de parenthèses ou de caractères spéciaux dans les identifiants de noeuds ou de subgraphs.
- Exemple correct : subgraph ESP8266_MCU ["Microcontrôleur ESP8266"]
- Utilise toujours des crochets [] ou des guillemets "" pour les labels contenant des espaces.
`;
const GITHUB_DOC_INSTRUCTION = `
Lorsqu'un lien GitHub est fourni, ta réponse doit inclure une section "DOCUMENTATION TECHNIQUE" structurée ainsi :
1. **Architecture Réelle vs Théorique** : Compare le branchement vu sur la photo avec les définitions de pins dans le code GitHub.
2. **Guide de Maintenance Hardware** : 
   - Liste les points de contrôle (ex: vérifier les soudures sur tel composant).
   - Recommandations de protection (ex: ajout d'une résistance de tirage si absente).
3. **Schéma de Câblage Dynamique** : Génère un bloc Mermaid.js reflétant le montage PHYSIQUE actuel.
4. **Procédure de Test** : Quelles étapes suivre pour vérifier que le hardware et le software communiquent bien.
`;
export async function POST(req) {
  try {
    const data = await req.json();
    const { referenceFiles, realityFiles, files, input, isCompare, sessionId, history } = data;
    // 1. DÉCLARATION INITIALE (CORRECTION ICI)
    const promptParts = [];

    // 2. GESTION GITHUB
    let githubContext = "";
    if (input.includes("github.com")) {
      // Extraction robuste de l'URL
      const match = input.match(/https:\/\/github\.com\/[^\s]+/);
      if (match) {
        const repoUrl = match[0];
        // On récupère le contenu
        githubContext = await getRepoContent(repoUrl);
      }
    }
    // 3. INJECTION DU CONTEXTE GITHUB
    if (githubContext) {
      promptParts.push({ text: `VOICI LE CODE SOURCE DU PROJET GITHUB :\n${githubContext}` });
      promptParts.push({
        text: "INSTRUCTION : Analyse ce code et compare-le au montage physique pour rédiger la documentation.",
      });
      // Ajout de l'instruction spécifique pour la structure de la doc
      promptParts.push({ text: GITHUB_DOC_INSTRUCTION });
    }
    // Ajout d'une consigne de complétude directement dans le prompt
    const completionInstruction =
      "Analyse chaque seconde de ce média. Ne résume pas de manière superficielle, donne un inventaire technique complet en français.";
    promptParts.push({ text: completionInstruction });
    if (isCompare) {
      promptParts.push({ text: "CONTEXTE: AUDIT COMPARATIF ACTIF.\n" });

      if (referenceFiles?.length > 0) {
        promptParts.push({ text: "--- DOCUMENTS DE RÉFÉRENCE (DESSIN/CODE) ---" });
        referenceFiles.forEach((f) => {
          promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
        });
      }

      if (realityFiles?.length > 0) {
        promptParts.push({ text: "--- RÉALITÉ DU MONTAGE À AUDITER (PHOTOS/VIDÉOS) ---" });
        realityFiles.forEach((f) => {
          promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
        });
      }

      promptParts.push({
        text: `INSTRUCTION: Compare la réalité par rapport à la référence. Trouve les erreurs de branchement. Question : ${input}`,
      });
    } else {
      promptParts.push({
        text: `Question de l'utilisateur : ${input || "Analyse ce contenu technique."}`,
      });
      const media = files || realityFiles || [];
      media.forEach((f) => {
        promptParts.push({ inlineData: { mimeType: f.type, data: f.data.split(",")[1] } });
      });
    }

    // ... dans votre fonction POST, remplacez la boucle "while" par ceci :

    let aiResponse = "";
    // 1. Liste des modèles à essayer dans l'ordre de préférence
    const modelsToTry = [
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
       "gemini-2.5-pro",
      // "gemini-3-flash-preview", // Premier choix pour le hackathon(pour la démo finale)
    ];

    const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
    let lastError = null;

    // 2. Essayer chaque modèle séquentiellement
    for (const currentModelName of modelsToTry) {
      try {
        console.log(`Tentative avec le modèle: ${currentModelName}`);
        const model = genAI.getGenerativeModel({
          model: currentModelName,
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
        });

        const chat = model.startChat({
          history: history || [],
          generationConfig: { maxOutputTokens: 4000, temperature: 0.2 },
        });

        const result = await chat.sendMessage(promptParts);
        aiResponse = result.response.text();

        if (aiResponse) {
          console.log(`Succès avec le modèle: ${currentModelName}`);
          // Optionnel : Enregistrez le modèle utilisé pour le debug
          // await addDoc(..., { modelUsed: currentModelName });
          break; // Sortir de la boucle en cas de succès
        }
      } catch (error) {
        console.error(`Échec avec ${currentModelName}:`, error.message);
        lastError = error;

        // Si l'erreur est 429 (quota) ou 503 (surcharge), on essaie le modèle suivant
        // Pour d'autres erreurs (4xx), on peut décider de relancer ou non
        if (error.status === 429 || error.status === 503) {
          await delay(1000); // Petite pause avant le prochain essai
          continue; // Passer au modèle suivant dans la liste
        }
        // Pour les autres erreurs, on peut décider de stopper
        break;
      }
    }

    // 3. Si tous les modèles ont échoué
    if (!aiResponse) {
      // Vous pouvez gérer l'erreur proprement ici
      console.error("Tous les modèles ont échoué :", lastError);
      // Retourner un message d'erreur clair ou une analyse par défaut
      aiResponse =
        "**Note :** Capacité d'analyse temporairement limitée en raison de la forte demande sur les serveurs Gemini 3. Voici une analyse basique : [votre analyse de repli ici]";
    }
    // Sauvegarde Firestore (Asynchrone)
    addDoc(collection(db, "chats"), {
      sessionId: sessionId || "anonyme",
      type: isCompare ? "audit" : "simple",
      userQuery: input,
      aiResponse: aiResponse,
      createdAt: serverTimestamp(),
    }).catch(console.error);

    return NextResponse.json({ analysis: aiResponse });
  } catch (error) {
    console.error("ERREUR:", error);
    return NextResponse.json({ error: "Erreur technique." }, { status: 500 });
  }
}