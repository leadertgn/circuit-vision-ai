"use client";
import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Paperclip,
  Cpu,
  FileText,
  X,
  Menu,
  MessageSquare,
  ChevronRight,
  LayoutGrid,
  HelpCircle,
  Download,
  Copy,
  Check,
  Github,
} from "lucide-react";
import jsPDF from "jspdf";
import ReactMarkdown from "react-markdown";
import Mermaid from "@/components/Mermaid";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getSessionId } from "@/lib/session";
import { useGithubDocButton } from '@/hooks/useGithubDocButton';
import GithubDocButton from '@/components/GithubDocButton';

const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/ddn3wpmgi/image/upload`;
const UPLOAD_PRESET = "circuit_vision";

const uploadToCloudinary = async (base64File, fileType) => {
  try {
    const isVideo = fileType?.startsWith("video");
    const resourceType = isVideo ? "video" : "image";
    const url = `https://api.cloudinary.com/v1_1/ddn3wpmgi/${resourceType}/upload`;

    const formData = new FormData();
    formData.append("file", base64File);
    formData.append("upload_preset", UPLOAD_PRESET);

    const res = await fetch(url, { method: "POST", body: formData });
    const data = await res.json();
    return data.secure_url;
  } catch (err) {
    console.error("Cloudinary Error:", err);
    return null;
  }
};

export default function Home() {
  // --- ÉTATS ---
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // États pour les fichiers
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [refAttachments, setRefAttachments] = useState([]);
  const [realAttachments, setRealAttachments] = useState([]);

  const fileInputRef = useRef(null);
  const realityInputRef = useRef(null);
  const scrollRef = useRef(null);
  const sessionId = getSessionId();

  // Hook pour détecter si on doit afficher le bouton GitHub


  const { shouldShowButton, githubUrl, documentationContent } = useGithubDocButton(messages, activeChatId);

  // --- EFFETS (Firebase) ---
  useEffect(() => {
    if (!sessionId) return;
    const q = query(
      collection(db, "conversations"),
      where("sessionId", "==", sessionId),
      orderBy("updatedAt", "desc")
    );
    return onSnapshot(q, (snapshot) => {
      setConversations(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
  }, [sessionId]);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, "conversations", activeChatId, "messages"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map((doc) => doc.data());
      setMessages(newMessages);
    });
  }, [activeChatId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // --- FONCTIONS UTILITAIRES ---
  const extractGithubUrl = (text) => {
    const match = text.match(/https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+/);
    if (match) {
      return match[0].replace(/[.,;]$/, "");
    }
    return null;
  };

  const getCleanFullDoc = (allMessages) => {
    return allMessages
      .filter((m) => m.role === "ai")
      .map((m) => {
        let text = m.text;
        text = text.replace(/\*\*Note :\*\* Capacité d'analyse temporairement limitée.*/gi, "");
        text = text.replace(/Je dois réitérer un point crucial.*/gi, "");
        text = text.replace(/La réponse précédente a été interrompue.*/gi, "");
        text = text.replace(/CircuitVision AI à votre service.*/gi, "");
        text = text.replace(/En tant qu'IA.*?\./gi, "");
        text = text.replace(/Je suis.*?\./gi, "");
        text = text.replace(/Souhaitez-vous que je mette à jour le fichier.*/gi, "");
        return text.trim();
      })
      .filter((t) => t.length > 0)
      .join("\n\n---\n\n");
  };

  const handleRefineAndPush = async (url) => {
    setLoading(true);
    const rawDoc = getCleanFullDoc(messages);

    const refinementPrompt = `Tu es un Rédacteur Technique Senior. Transforme ce texte en un README.md professionnel COMPLET.

CONSIGNES STRICTES :
1. PRÉSERVE TOUT LE CONTENU TECHNIQUE : tableaux, schémas Mermaid, code, procédures complètes.
2. SUPPRIME uniquement :
   - Les mentions d'IA ("En tant que...", "Je suis...", "CircuitVision AI")
   - Les excuses sur vidéos/images manquantes
   - Les phrases type "Souhaitez-vous que je..."
3. GARDE ABSOLUMENT :
   - Tous les tableaux de pins
   - Tous les schémas Mermaid
   - Toutes les sections (Installation, Tests, Structure Firebase, etc.)
   - Tous les exemples de code
   - Toutes les procédures détaillées
4. STRUCTURE FINALE en sections claires avec ces titres exacts :
   # Nom du Projet
   ## Vue d'ensemble
   ## Composants Hardware
   ## Configuration des Pins
   ## Bibliothèques et Dépendances
   ## Logique du Code Principal
   ## Schéma de Câblage
   ## Procédure d'Installation
   ## Tests et Dépannage
   (+ toutes autres sections présentes dans le document original)

IMPORTANT : Cette documentation doit être COMPLÈTE et EXHAUSTIVE. Ne résume RIEN, ne tronque RIEN.
Réponds UNIQUEMENT avec le contenu Markdown final.

TEXTE À TRANSFORMER :
${rawDoc}`;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: refinementPrompt,
          sessionId: "refinement-" + Date.now(),
        }),
      });
      const { analysis: polishedDoc } = await res.json();

      const githubRes = await fetch("/api/github/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: url, content: polishedDoc }),
      });

      if (githubRes.ok) {
        alert("✅ Documentation pro déployée !");
      } else {
        alert("Erreur lors du déploiement sur GitHub.");
      }
    } catch (error) {
      alert("Erreur lors du déploiement.");
    } finally {
      setLoading(false);
    }
  };

  const resetConversation = () => {
    if (window.confirm("Démarrer un nouveau projet ?")) {
      setMessages([]);
      setInput("");
      setRefAttachments([]);
      setRealAttachments([]);
      setActiveChatId(null);
    }
  };

  // --- LOGIQUE UPLOAD ---
  const processFile = (file, callback) => {
    if (file.size > 20 * 1024 * 1024) return alert("Fichier trop lourd (>20Mo)");
    const reader = new FileReader();
    reader.onload = (e) => {
      if (file.type.startsWith("image")) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX = 1000;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            const r = MAX / Math.max(width, height);
            width *= r;
            height *= r;
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          callback({
            type: "image/jpeg",
            name: file.name,
            data: canvas.toDataURL("image/jpeg", 0.7),
          });
        };
      } else {
        callback({ type: file.type, name: file.name, data: e.target.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = (e, type) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      processFile(file, (data) => {
        if (type === "ref") setRefAttachments((p) => [...p, data]);
        else setRealAttachments((p) => [...p, data]);
      });
    });
    e.target.value = null;
  };

  // --- ENVOI MESSAGE ---
  const sendMessage = async (overrideInput = null, hideUserMessage = false) => {
    const displayMessage = overrideInput ? "Continuer la rédaction..." : input;
    const technicalPrompt = overrideInput || input;

    if (!technicalPrompt && refAttachments.length === 0 && realAttachments.length === 0) return;

    setLoading(true);
    let chatId = activeChatId;

    try {
      const uploadAll = async (list) =>
        Promise.all(
          list.map(async (f) => ({ type: f.type, url: await uploadToCloudinary(f.data, f.type) }))
        );
      const [upRef, upReal] = await Promise.all([
        uploadAll(refAttachments),
        uploadAll(realAttachments),
      ]);

      if (!chatId) {
        const docRef = await addDoc(collection(db, "conversations"), {
          sessionId,
          title: displayMessage.substring(0, 30) || "Analyse Circuit",
          updatedAt: serverTimestamp(),
        });
        chatId = docRef.id;
        setActiveChatId(chatId);
      }

      // Ne sauvegarder le message utilisateur que si hideUserMessage est false
      if (!hideUserMessage) {
        await addDoc(collection(db, "conversations", chatId, "messages"), {
          role: "user",
          text: displayMessage,
          files: [...upRef, ...upReal],
          isCompare: isCompareMode,
          createdAt: serverTimestamp(),
        });
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [...refAttachments, ...realAttachments],
          input: technicalPrompt,
          isCompare: isCompareMode,
          sessionId,
          // AMÉLIORATION : Historique avec plus de messages pour les continuations
          // Si c'est une continuation (hideUserMessage=true), on envoie plus d'historique
          history: messages.slice(hideUserMessage ? -10 : -6).map((m) => ({
            role: m.role === "user" ? "user" : "model", // Gemini utilise 'model' pas 'assistant'
            parts: [{ text: m.text }],
          })),
        }),
      });

      const data = await response.json();
      if (data.analysis) {
        await addDoc(collection(db, "conversations", chatId, "messages"), {
          role: "ai",
          text: data.analysis,
          createdAt: serverTimestamp(),
        });
      }

      setInput("");
      setRefAttachments([]);
      setRealAttachments([]);

      if (messages.length === 0 && data.analysis) {
        fetch("/api/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, aiFirstResponse: data.analysis }),
        }).catch(console.error);
      }
    } catch (err) {
      alert("Erreur lors de l'envoi.");
    } finally {
      setLoading(false);
    }
  };

  const continueGeneration = async () => {
    if (loading) return;
    
    const lastAiMsg = [...messages].reverse().find((m) => m.role === "ai");
    if (!lastAiMsg) return;
    
    // Identifier la dernière section complétée
    const lastText = lastAiMsg.text;
    const sections = lastText.split(/#{1,3}\s+/); // Split par headers markdown
    const lastSection = sections[sections.length - 1];
    
    // Extraire les 300 derniers caractères pour le contexte
    const contextEnd = lastText.slice(-300);
    
    // Compter les sections déjà générées
    const sectionCount = (lastText.match(/#{1,3}\s+\d+\./g) || []).length;
    
    // Créer un prompt très spécifique
    const prompt = `CONTINUE LA DOCUMENTATION à partir de la section ${sectionCount + 1}.

CONTEXTE (fin de la section précédente) :
"${contextEnd}"

INSTRUCTIONS CRITIQUES :
1. NE RÉPÈTE PAS les sections déjà écrites (sections 1-${sectionCount})
2. COMMENCE DIRECTEMENT par la section suivante (section ${sectionCount + 1})
3. Si toutes les sections sont complètes, ajoute des détails supplémentaires (Exemples, FAQ, Troubleshooting avancé)
4. AUCUN préambule ("Voici la suite...", "Je continue...", etc.)

COMMENCE MAINTENANT :`;
    
    await sendMessage(prompt, true);
  };

  // --- FONCTIONS D'EXPORT ---
  const generatePDF = (text) => {
    const doc = new jsPDF();
    const cleanText = text.replace(/\*\*/g, "").replace(/###/g, "---");
    doc.setFont("helvetica", "bold");
    doc.text("RAPPORT D'AUDIT TECHNIQUE", 15, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(cleanText, 180);
    doc.text(lines, 15, 40);
    doc.save(`Audit_${Date.now()}.pdf`);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Code copié !");
  };

  // Détection de fin de documentation
  const isDocumentationComplete = () => {
    const lastAiMsg = [...messages].reverse().find((m) => m.role === "ai");
    if (!lastAiMsg) return false;

    const completionIndicators = [
      /fin de (la )?documentation/i,
      /documentation complète/i,
      /voilà.*documentation/i,
      /j'espère que cette documentation/i,
      /cette documentation.*devrait/i,
      /n'hésitez pas.*questions/i,
    ];

    return completionIndicators.some((pattern) => pattern.test(lastAiMsg.text));
  };

  const hasGithubUrl = () => {
    return messages.some((m) => extractGithubUrl(m.text) !== null);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden relative">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex flex-col p-4 shadow-xl transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-2">
            <Cpu className="text-blue-400 animate-pulse" />
            <span className="font-bold text-lg">CircuitVision AI</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2">
            <X size={20} />
          </button>
        </div>
        <button
          onClick={resetConversation}
          className="flex items-center gap-2 border border-red-400 text-red-400 rounded-xl p-3 text-sm hover:bg-red-500/10 mb-4 transition-all"
        >
          <X size={16} /> Nouveau Projet
        </button>
        <div className="flex-1 overflow-y-auto space-y-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveChatId(conv.id)}
              className={`w-full text-left p-3 rounded-xl text-sm flex items-center gap-3 ${activeChatId === conv.id ? "bg-blue-600" : "hover:bg-slate-800"}`}
            >
              <MessageSquare size={16} className="opacity-50" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-white md:rounded-l-[2.5rem] shadow-2xl overflow-hidden border-l border-slate-100">
        <header className="flex items-center justify-between p-4 border-b border-slate-100 md:px-12 bg-white/80">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 bg-slate-100 rounded-xl md:hidden"
          >
            <Menu size={20} />
          </button>
          <button
            onClick={() => setIsCompareMode(!isCompareMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${isCompareMode ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"}`}
          >
            <LayoutGrid size={14} /> {isCompareMode ? "MODE AUDIT" : "ANALYSE SIMPLE"}
          </button>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:px-12 lg:px-24 space-y-6 pt-6"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <div className="bg-blue-50 p-6 rounded-[2rem] text-blue-600 animate-bounce">
                <Cpu size={48} />
              </div>
              <h1 className="text-2xl font-black text-slate-800">Prêt pour l'audit ?</h1>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`relative group max-w-[85%] rounded-[2rem] p-6 ${msg.role === "user" ? "bg-blue-600 text-white shadow-xl" : "bg-slate-50 border border-slate-100"}`}
                >
                  {msg.role === "ai" && (
                    <button
                      onClick={() => generatePDF(msg.text)}
                      className="absolute -top-4 right-4 bg-white border p-2 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 text-xs font-bold"
                    >
                      <Download size={14} className="text-blue-600" /> PDF Audit
                    </button>
                  )}
                  {msg.files?.length > 0 && (
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {msg.files.map((f, idx) => (
                        <img
                          key={idx}
                          src={f.url}
                          className="w-24 h-24 object-cover rounded-2xl border-2 border-white/20"
                          alt="media"
                        />
                      ))}
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none text-inherit break-words overflow-wrap-anywhere">
                    <ReactMarkdown
                      components={{
                        code({ inline, className, children }) {
                          const match = /language-mermaid/.exec(className || "");
                          const isCodeBlock = !inline;

                          if (!inline && match) return <Mermaid chart={String(children)} />;

                          // Pour les blocs de code (non-inline)
                          if (isCodeBlock) {
                            return (
                              <div className="relative group/code">
                                <code
                                  className={`${className} bg-slate-800 text-white p-3 rounded-lg block overflow-x-auto text-xs my-2`}
                                >
                                  {children}
                                </code>
                                <button
                                  onClick={() => copyToClipboard(String(children))}
                                  className="absolute top-2 right-2 p-1.5 bg-slate-700 text-white rounded-md opacity-0 group-hover/code:opacity-100 transition-opacity"
                                >
                                  <Copy size={12} />
                                </button>
                              </div>
                            );
                          }

                          // Pour le code inline (dans un paragraphe)
                          return (
                            <code
                              className={`${className} bg-slate-800 text-white px-1.5 py-0.5 rounded text-xs`}
                            >
                              {children}
                            </code>
                          );
                        },
                        p: ({ children }) => (
                          <div className="mb-4 last:mb-0 leading-relaxed">{children}</div>
                        ),
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>

                    {/* BOUTON GITHUB : Apparaît uniquement si doc complète */}
                    {msg.role === "ai" && 
                      i === messages.length - 1 && 
                      shouldShowButton && (
                        <div className="mt-4">
                          <GithubDocButton
                            githubUrl={githubUrl}
                            documentationContent={documentationContent}
                            onSuccess={() => {
                              console.log('✅ Documentation envoyée sur GitHub');
                            }}
                          />
                        </div>
                      )}

                    {msg.role === "ai" &&
                      i === messages.length - 1 &&
                      msg.text.length > 1000 &&
                      !isDocumentationComplete() && (
                        <button
                          onClick={continueGeneration}
                          disabled={loading}
                          className="mt-4 flex items-center gap-2 text-blue-600 font-bold bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 transition-all"
                        >
                          <ChevronRight size={14} /> Continuer la rédaction
                        </button>
                      )}
                  </div>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-2 p-4 bg-slate-50 rounded-2xl w-fit animate-pulse">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
              <span>Analyse en cours...</span>
            </div>
          )}
        </div>

        {/* SECTION GITHUB - Apparaît uniquement si doc complète ET URL détectée */}
        {isDocumentationComplete() && hasGithubUrl() && (
          <div className="px-6 md:px-12 py-4 bg-blue-50/50 border-t flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Github size={20} className="text-slate-700" />
              <p className="text-xs text-slate-600">
                Documentation prête pour déploiement professionnel.
              </p>
            </div>
            <button
              onClick={() => {
                let url = null;
                [...messages].reverse().forEach((m) => {
                  if (!url) url = extractGithubUrl(m.text);
                });
                if (url) handleRefineAndPush(url);
                else alert("URL GitHub non détectée.");
              }}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-black flex items-center gap-2"
            >
              <Github size={14} /> Finaliser & Publier sur GitHub
            </button>
          </div>
        )}

        <div className="p-6 md:px-12 lg:px-24">
          <div className="max-w-4xl mx-auto space-y-3">
            {isCompareMode && (
              <div className="grid grid-cols-2 gap-3 animate-in fade-in">
                <div className="bg-orange-50/50 border-2 border-dashed border-orange-200 rounded-2xl p-4 flex flex-col items-center relative">
                  <input
                    type="file"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => handleUpload(e, "ref")}
                  />
                  <FileText className="text-orange-400 mb-1" />
                  <span className="text-[10px] font-bold text-orange-600 text-center">
                    SCHÉMA / CODE (THÉORIE)
                  </span>
                  {refAttachments.length > 0 && (
                    <span className="text-[10px] mt-1">{refAttachments.length} fichier(s)</span>
                  )}
                </div>
                <div className="bg-blue-50/50 border-2 border-dashed border-blue-200 rounded-2xl p-4 flex flex-col items-center relative">
                  <input
                    type="file"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => handleUpload(e, "real")}
                  />
                  <Paperclip className="text-blue-400 mb-1" />
                  <span className="text-[10px] font-bold text-blue-600 text-center">
                    PHOTO / VIDÉO (RÉEL)
                  </span>
                  {realAttachments.length > 0 && (
                    <span className="text-[10px] mt-1">{realAttachments.length} fichier(s)</span>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-end gap-2 bg-slate-100 rounded-[2rem] p-2 border border-slate-200">
              {!isCompareMode && (
                <button
                  onClick={() => fileInputRef.current.click()}
                  className="p-3 text-slate-400 hover:text-blue-600 transition-colors"
                >
                  <Paperclip size={22} />
                </button>
              )}
              <input
                type="file"
                multiple
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => handleUpload(e, "real")}
              />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder={isCompareMode ? "Décrivez le problème..." : "Analysez mon circuit..."}
                className="flex-1 bg-transparent border-none focus:ring-0 p-3 text-sm resize-none min-h-[44px]"
                rows="1"
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading}
                className="bg-blue-600 text-white p-4 rounded-2xl hover:bg-blue-700 disabled:opacity-50 shadow-lg"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}