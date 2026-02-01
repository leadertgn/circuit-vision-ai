import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import "dotenv/config";

// On force la lecture de .env.local si .env ne fonctionne pas
import { config } from "dotenv";
config({ path: ".env.local" });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function nuke() {
  console.log("🚀 Nettoyage forcé de la base...");
  const collections = ["conversations", "chats"];

  for (const colName of collections) {
    console.log(`\n--- Collection: ${colName} ---`);
    try {
      const snap = await getDocs(collection(db, colName));

      if (snap.empty) {
        console.log("  Collection vide.");
        continue;
      }

      for (const d of snap.docs) {
        if (colName === "conversations") {
          const msgSnap = await getDocs(collection(db, "conversations", d.id, "messages"));
          await Promise.all(msgSnap.docs.map((m) => deleteDoc(m.ref)));
          console.log(`  🗑️ Messages de ${d.id} supprimés`);
        }
        await deleteDoc(doc(db, colName, d.id));
        console.log(`  ✅ Document ${d.id} supprimé`);
      }
    } catch (e) {
      console.error(`  ❌ Erreur: ${e.message}`);
    }
  }
  console.log("\n✨ Base de données totalement vide !");
  process.exit(0);
}

nuke();
