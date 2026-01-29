// route_titre.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { NextResponse } from "next/server";

const MODELS = [
  "gemini-2.0-flash-lite-preview-02-05", // Priorité au Lite (moins cher/plus de quota)
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest"
];

export async function POST(req) {
  try {
    const { chatId, aiFirstResponse } = await req.json();
    const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
    
    let title = "Analyse Technique";
    let lastError = null;

    for (const modelName of MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `Génère un titre très court (3 à 5 mots) en français pour cette analyse : "${aiFirstResponse.substring(0, 300)}". Réponds uniquement le titre.`;
        
        const result = await model.generateContent(prompt);
        title = result.response.text().trim().replace(/[".]/g, "");
        if (title) break; // Succès !
      } catch (error) {
        console.error(`Titre - Échec avec ${modelName}`);
        lastError = error;
      }
    }

    const convRef = doc(db, "conversations", chatId);
    await updateDoc(convRef, { title });

    return NextResponse.json({ title });
  } catch (error) {
    return NextResponse.json({ error: "Échec génération titre" }, { status: 500 });
  }
}