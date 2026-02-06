import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";

// Server-side API key only - NO NEXT_PUBLIC_ prefix
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODELS = [
  "gemini-2.5-flash", // Stable + rapide
  "gemini-2.5-flash-lite", // Stable + économique
  "gemini-2.5-pro", // Stable + puissant
];

// Validation schema
const TitleSchema = z.object({
  chatId: z.string().min(1),
  userFirstQuery: z.string().min(1).optional(),
  aiFirstResponse: z.string().min(10),
});

export async function POST(req) {
  try {
    // Validate input
    const { chatId, userFirstQuery, aiFirstResponse } = TitleSchema.parse(await req.json());

    // Vérifier si un titre personnalisé existe déjà
    const convRef = doc(db, "conversations", chatId);
    const convSnap = await getDoc(convRef);

    if (convSnap.exists()) {
      const existingTitle = convSnap.data().title;
      // Si le titre a déjà été personnalisé et n'est pas un titre temporaire, ne pas le regénérer
      if (
        existingTitle &&
        existingTitle !== "Nouvelle conversation" &&
        existingTitle !== "Analyse Circuit"
      ) {
        console.log("Titre déjà existant:", existingTitle);
        return NextResponse.json({ title: existingTitle });
      }
    }

    let title = "Analyse Technique";
    let lastError = null;

    for (const modelName of MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });

        // Construire le prompt avec les deux inputs
        const userContext = userFirstQuery
          ? `Requête utilisateur: "${userFirstQuery.substring(0, 150)}"`
          : "";
        const aiContext = `Analyse IA: "${aiFirstResponse.substring(0, 300)}"`;

        const prompt = `Génère un titre très court (3 à 5 mots) en français qui combine ces deux éléments :\n${userContext}\n${aiContext}\n\nLe titre doit refléter le PROJET ou le SUJET principal, pas la réponse technique. Réponds uniquement le titre.`;

        const result = await model.generateContent(prompt);
        title = result.response.text().trim().replace(/[".]/g, "");
        if (title) break; // Succès !
      } catch (error) {
        console.error(`Titre - Échec avec ${modelName}:`, error.message);
        lastError = error;
      }
    }

    await updateDoc(convRef, { title });

    return NextResponse.json({ title });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    console.error("Erreur génération titre:", error);
    return NextResponse.json({ error: "Échec génération titre" }, { status: 500 });
  }
}
