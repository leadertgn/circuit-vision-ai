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
  const [refAttachments, setRefAttachments] = useState([]); // Schémas (Référence)
  const [realAttachments, setRealAttachments] = useState([]); // Photos (Réalité)

  const fileInputRef = useRef(null);
  const realityInputRef = useRef(null);
  const scrollRef = useRef(null);
  const sessionId = getSessionId();

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

  // Effet de défilement automatique
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // --- FONCTIONS UTILITAIRES ---
  const extractGithubUrl = (text) => {
    // Cette regex s'arrête pile à la fin du nom du repo, ignorant la ponctuation finale
    const match = text.match(/https:\/\/github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+/);
    if (match) {
      let url = match[0];
      // Nettoyage final au cas où un point ou une virgule traîne
      return url.replace(/[.,;]$/, "");
    }
    return null;
  };
  // Après extractGithubUrl, ajouter :

  // 1. Fusion et nettoyage amélioré
  const getCleanFullDoc = (allMessages) => {
    return allMessages
      .filter((m) => m.role === "ai")
      .map((m) => {
        let text = m.text;
        // NETTOYAGE : On retire les phrases parasites via Regex
        text = text.replace(/\*\*Note :\*\* Capacité d'analyse temporairement limitée.*/gi, "");
        text = text.replace(/Je dois réitérer un point crucial : aucun média.*/gi, "");
        text = text.replace(/La réponse précédente a été interrompue.*/gi, "");
        text = text.replace(/Souhaitez-vous que je mette à jour le fichier.*/gi, "");
        text = text.replace(/En tant qu'IA.*?\./gi, "");
        text = text.replace(/Je suis.*?\./gi, "");
        return text.trim();
      })
      .filter((t) => t.length > 0)
      .join("\n\n---\n\n");
  };

  // 2. Nouvelle fonction de raffinement et déploiement
  const handleRefineAndPush = async (url) => {
    setLoading(true);
    const rawDoc = getCleanFullDoc(messages);

    const refinementPrompt = `
    Tu es un Rédacteur Technique Senior. Transforme ce texte en un README.md professionnel.
    CONSIGNES :
    1. Supprime TOUTE mention de ton identité d'IA ("En tant que...", "Je suis...", "CircuitVision AI").
    2. Supprime les excuses sur les vidéos/images manquantes.
    3. Garde uniquement la substance technique (Architecture, Pins, Code, Procédures).
    4. Structure en sections claires : Introduction, Matériel, Installation, Schéma, Code.
    5. Réponds UNIQUEMENT avec le contenu Markdown final, sans commentaires.

    TEXTE À TRANSFORMER : ${rawDoc}`;

    try {
      // 1. Appel à l'API pour polir la doc
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: refinementPrompt,
          sessionId: "refinement-" + Date.now(),
        }),
      });
      const { analysis: polishedDoc } = await res.json();

      // 2. Envoi sur GitHub
      const githubRes = await fetch("/api/github/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: url,
          content: polishedDoc,
        }),
      });

      if (githubRes.ok) {
        alert("✅ Documentation professionnelle déployée sur GitHub !");
      } else {
        alert("Erreur lors du déploiement sur GitHub.");
      }
    } catch (error) {
      console.error(error);
      alert("Erreur technique lors du déploiement.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Fonction de réinitialisation (Nouveau Projet)
  const resetConversation = () => {
    if (
      window.confirm(
        "Voulez-vous démarrer un nouveau projet ? Cette action réinitialisera la conversation actuelle."
      )
    ) {
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

  // --- ENVOI MESSAGE (avec paramètre overrideInput) ---
  const sendMessage = async (overrideInput = null) => {
    const messageToSend = overrideInput || input;
    if (!messageToSend && refAttachments.length === 0 && realAttachments.length === 0) return;

    setLoading(true);
    let chatId = activeChatId;

    try {
      // 1. Upload Cloudinary
      const uploadAll = async (list) =>
        Promise.all(
          list.map(async (f) => ({ type: f.type, url: await uploadToCloudinary(f.data, f.type) }))
        );
      const [upRef, upReal] = await Promise.all([
        uploadAll(refAttachments),
        uploadAll(realAttachments),
      ]);

      // 2. Init Conversation
      if (!chatId) {
        const docRef = await addDoc(collection(db, "conversations"), {
          sessionId,
          title:
            messageToSend.substring(0, 30) ||
            (isCompareMode ? "Audit Comparatif" : "Analyse Circuit"),
          updatedAt: serverTimestamp(),
        });
        chatId = docRef.id;
        setActiveChatId(chatId);
      }

      // 3. Sauvegarde Message Utilisateur (Firebase)
      await addDoc(collection(db, "conversations", chatId, "messages"), {
        role: "user",
        text: messageToSend,
        files: [...upRef, ...upReal],
        isCompare: isCompareMode,
        createdAt: serverTimestamp(),
      });

      // 4. Appel API avec séparation
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceFiles: refAttachments,
          realityFiles: realAttachments,
          files: [...refAttachments, ...realAttachments],
          input: messageToSend,
          isCompare: isCompareMode,
          language: "fr",
          sessionId,
          history: messages.slice(-6).map((m) => ({
            role: m.role === "user" ? "user" : "model",
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

      // 5. Réinitialisation (seulement si pas d'override)
      if (!overrideInput) {
        setInput("");
      }
      setRefAttachments([]);
      setRealAttachments([]);

      // 6. Génération de titre (seulement premier message)
      if (messages.length === 0) {
        fetch("/api/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            aiFirstResponse: data.analysis,
          }),
        }).catch(console.error);
      }
    } catch (err) {
      alert("Erreur lors de l'envoi.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // --- FONCTION CONTINUER LA RÉDACTION ---
  const continueGeneration = async () => {
    if (loading) return;

    const promptContinuation =
      "La réponse précédente a été interrompue. Veuillez continuer exactement là où vous vous êtes arrêté, " +
      "en reprenant la dernière phrase ou le dernier bloc de code pour terminer la documentation.";

    await sendMessage(promptContinuation);
  };

  // --- FONCTIONS D'EXPORT ---
  const generatePDF = (text) => {
    const doc = new jsPDF();
    const pageWidth = 180;
    const margin = 15;
    let cursorY = 45;

    const cleanText = text.replace(/\*\*/g, "").replace(/###/g, "---");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("RAPPORT D'AUDIT TECHNIQUE", margin, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("CircuitVision AI - Expert Systèmes Embarqués", margin, 28);
    doc.text(`Généré le : ${new Date().toLocaleString()}`, margin, 34);

    doc.setLineWidth(0.5);
    doc.line(margin, 38, 195, 38);

    doc.setFontSize(11);
    const lines = doc.splitTextToSize(cleanText, pageWidth);

    lines.forEach((line) => {
      if (cursorY > 270) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(line, margin, cursorY);
      cursorY += 7;
    });

    doc.save(`CircuitVision_Audit_${Date.now()}.pdf`);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Code copié !");
  };

  // --- RENDU ---
  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden relative">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex flex-col p-4 shadow-xl transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-2">
            <Cpu className="text-blue-400 animate-pulse" />
            <span className="font-bold text-lg">CircuitVision AI</span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-2 hover:bg-slate-800 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        <button
          onClick={() => {
            setActiveChatId(null);
            setIsSidebarOpen(false);
          }}
          className="flex items-center gap-2 border border-slate-700 rounded-xl p-3 text-sm hover:bg-slate-800 mb-4"
        >
          <X size={16} /> Nouvelle Analyse
        </button>
        <button
          onClick={resetConversation}
          className="flex items-center gap-2 border border-red-200 text-red-600 rounded-xl p-3 text-sm hover:bg-red-50 mb-4 transition-colors"
        >
          <X size={16} /> Nouveau Projet
        </button>
        <div className="flex-1 overflow-y-auto space-y-2">
          <p className="text-xs font-semibold text-slate-500 px-2 uppercase mb-2">Historique</p>
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => {
                setActiveChatId(conv.id);
                setIsSidebarOpen(false);
              }}
              className={`w-full text-left p-3 rounded-xl text-sm flex items-center gap-3 ${activeChatId === conv.id ? "bg-blue-600" : "hover:bg-slate-800"}`}
            >
              <MessageSquare size={16} className="opacity-50" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col bg-white md:rounded-l-[2.5rem] shadow-2xl overflow-hidden border-l border-slate-100">
        <header className="flex items-center justify-between p-4 border-b border-slate-100 md:px-12 bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 bg-slate-100 rounded-xl md:hidden"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-sm font-bold text-slate-700 truncate">
              {activeChatId
                ? conversations.find((c) => c.id === activeChatId)?.title
                : "Diagnostic Expert"}
            </h2>
          </div>

          {/* TOGGLE MODE COMPARER */}
          <button
            onClick={() => setIsCompareMode(!isCompareMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${isCompareMode ? "bg-orange-100 text-orange-600 ring-2 ring-orange-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
          >
            <LayoutGrid size={14} />
            {isCompareMode ? "MODE AUDIT ACTIF" : "MODE ANALYSE SIMPLE"}
          </button>
        </header>

        {/* MESSAGES */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:px-12 lg:px-24 space-y-6 pt-6 scroll-smooth"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <div className="bg-blue-50 p-6 rounded-[2rem] text-blue-600 animate-bounce">
                <Cpu size={48} />
              </div>
              <h1 className="text-2xl font-black text-slate-800">Prêt pour l'audit ?</h1>
              <p className="text-slate-500 max-w-sm text-sm">
                Activez le <b>Mode Audit</b> pour comparer votre schéma théorique avec votre montage
                réel.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`relative group max-w-[85%] rounded-[2rem] p-6 ${msg.role === "user" ? "bg-blue-600 text-white shadow-xl" : "bg-slate-50 border border-slate-100 text-slate-800"}`}
                >
                  {/* Bouton de téléchargement PDF (Uniquement IA) */}
                  {msg.role === "ai" && (
                    <button
                      onClick={() => generatePDF(msg.text)}
                      className="absolute -top-4 right-4 bg-white border border-slate-200 text-slate-600 p-2 rounded-lg shadow-sm hover:bg-slate-50 flex items-center gap-2 text-xs font-bold transition-all opacity-0 group-hover:opacity-100"
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
                          className="w-24 h-24 object-cover rounded-2xl border-2 border-white/20 shadow-sm"
                          alt="media"
                        />
                      ))}
                    </div>
                  )}

                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        code({ inline, className, children }) {
                          const match = /language-mermaid/.exec(className || "");
                          const isCodeBlock = !inline;

                          if (!inline && match) return <Mermaid chart={String(children)} />;

                          return (
                            <div className="relative group/code">
                              <code
                                className={`${className} bg-slate-800 text-slate-100 rounded-lg p-3 block my-2 text-xs overflow-x-auto`}
                              >
                                {children}
                              </code>
                              {isCodeBlock && (
                                <button
                                  onClick={() => copyToClipboard(String(children))}
                                  className="absolute top-2 right-2 p-1.5 bg-slate-700 text-white rounded-md opacity-0 group-hover/code:opacity-100 transition-opacity"
                                  title="Copier le code"
                                >
                                  <Copy size={12} />
                                </button>
                              )}
                            </div>
                          );
                        },
                        // Correction d'hydratation : éviter <div> dans <p>
                        p: ({ children }) => (
                          <div className="mb-4 last:mb-0 leading-relaxed">{children}</div>
                        ),
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>

                    {/* BOUTON CONTINUER LA RÉDACTION */}
                    {msg.role === "ai" && i === messages.length - 1 && msg.text.length > 1500 && (
                      <button
                        onClick={continueGeneration}
                        disabled={loading}
                        className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-800 text-xs font-bold bg-blue-50 px-3 py-2 rounded-lg transition-all disabled:opacity-50"
                      >
                        <ChevronRight size={14} />
                        {loading ? "Chargement..." : "Continuer la rédaction de la documentation"}
                      </button>
                    )}

                    {/* Section d'action GitHub */}
                    {msg.role === "ai" &&
                      (msg.text.includes("github.com") || input.includes("github.com")) && (
                        <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-blue-600 rounded-lg text-white">
                              <Github size={20} />
                            </div>
                            <div className="flex-1">
                              <h4 className="text-sm font-bold text-slate-800">
                                Synchronisation GitHub
                              </h4>
                              <p className="text-xs text-slate-600 mb-3">
                                Souhaitez-vous que je mette à jour le fichier <b>README.md</b> de
                                votre dépôt avec cet audit technique ? L'action est irréversible.
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    let url = null;
                                    // Chercher l'URL dans l'historique
                                    for (let m of [...messages].reverse()) {
                                      url = extractGithubUrl(m.text);
                                      if (url) break;
                                    }

                                    if (
                                      url &&
                                      window.confirm(
                                        `Publier la documentation professionnelle sur ${url} ?`
                                      )
                                    ) {
                                      handleRefineAndPush(url);
                                    } else if (!url) {
                                      alert("URL GitHub introuvable dans la discussion.");
                                    }
                                  }}
                                  className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-black transition-colors"
                                >
                                  <Github size={14} className="inline mr-2" />
                                  Approuver & Publier la version Pro
                                </button>
                                <button className="text-slate-400 px-4 py-2 text-xs font-medium hover:text-slate-600">
                                  Ignorer
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* INDICATEUR DE CHARGEMENT */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-.3s]" />
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-.5s]" />
                <span className="text-xs font-bold text-slate-400">
                  Analyse Multimodale en cours...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* INPUT AREA */}
        <div className="p-6 md:px-12 lg:px-24">
          <div className="max-w-4xl mx-auto space-y-3">
            {/* ZONE UPLOAD COMPARATIVE */}
            {isCompareMode ? (
              <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-bottom-2">
                {/* Zone Référence (Théorie) */}
                <div className="bg-orange-50/50 border-2 border-dashed border-orange-200 rounded-2xl p-3 flex flex-col items-center justify-center min-h-[100px] relative group hover:border-orange-400 transition-colors">
                  <input
                    type="file"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => handleUpload(e, "ref")}
                  />
                  <FileText className="text-orange-400 mb-1" size={20} />
                  <span className="text-[10px] font-bold text-orange-600 text-center">
                    SCHÉMA / CODE
                    <br />
                    (LA THÉORIE)
                  </span>
                  <div className="flex gap-1 mt-2">
                    {refAttachments.map((_, i) => (
                      <div key={i} className="w-2 h-2 bg-orange-400 rounded-full" />
                    ))}
                  </div>
                </div>
                {/* Zone Réalité (Montage) */}
                <div className="bg-blue-50/50 border-2 border-dashed border-blue-200 rounded-2xl p-3 flex flex-col items-center justify-center min-h-[100px] relative group hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => handleUpload(e, "real")}
                  />
                  <Paperclip className="text-blue-400 mb-1" size={20} />
                  <span className="text-[10px] font-bold text-blue-600 text-center">
                    PHOTO / VIDÉO
                    <br />
                    (LE RÉEL)
                  </span>
                  <div className="flex gap-1 mt-2">
                    {realAttachments.map((_, i) => (
                      <div key={i} className="w-2 h-2 bg-blue-400 rounded-full" />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // Mode Simple (Thumbnails habituels)
              <div className="flex gap-2 overflow-x-auto">
                {[...refAttachments, ...realAttachments].map((f, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 bg-white rounded-lg border shadow-sm relative overflow-hidden flex-shrink-0"
                  >
                    <img src={f.data} className="w-full h-full object-cover" alt="Upload" />
                    <button
                      onClick={() => {
                        setRefAttachments([]);
                        setRealAttachments([]);
                      }}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* TEXTAREA & SEND */}
            <div className="flex items-end gap-2 bg-slate-100 rounded-[2rem] p-2 border border-slate-200 focus-within:border-blue-300 transition-all">
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
                placeholder={
                  isCompareMode
                    ? "Décrivez le problème sur ce montage..."
                    : "Analysez mon circuit..."
                }
                className="flex-1 bg-transparent border-none focus:ring-0 p-3 text-sm resize-none min-h-[44px]"
                rows="1"
              />

              <button
                onClick={() => sendMessage()}
                disabled={loading}
                className="bg-blue-600 text-white p-4 rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-200"
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