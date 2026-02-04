"use client";

import React, { useState, useRef, useEffect } from "react";
import { Menu, LayoutGrid, BarChart3, Cpu, Zap } from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
} from "firebase/firestore";
import { getSessionId } from "@/lib/session";
import { useGithubDocButton } from "@/hooks/useGithubDocButton";

// Components
import { ConversationList } from "@/components/sidebar/ConversationList";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import StreamingMessage from "@/components/StreamingMessage";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import WokwiSimulator from "@/components/WokwiSimulator";
import GithubDocButton from "@/components/GithubDocButton";

// Constants
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/ddn3wpmgi/image/upload`;
const UPLOAD_PRESET = "circuit_vision";

// Helper: Upload to Cloudinary
const uploadToCloudinary = async (base64File, fileType) => {
  try {
    const isVideo = fileType?.startsWith("video");
    const resourceType = isVideo ? "video" : "image";
    const url = `${CLOUDINARY_URL}/${resourceType}/upload`;

    console.log("Cloudinary: Uploading to", url, "with preset", UPLOAD_PRESET);

    const formData = new FormData();
    formData.append("file", base64File);
    formData.append("upload_preset", UPLOAD_PRESET);

    const res = await fetch(url, { method: "POST", body: formData });

    console.log("Cloudinary response status:", res.status, res.statusText);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Cloudinary upload failed:", res.status, res.statusText, errorText);
      return null;
    }

    const data = await res.json();
    console.log("Cloudinary upload success:", data.secure_url);
    return data.secure_url;
  } catch (err) {
    console.error("Cloudinary Error:", err);
    return null;
  }
};

// Helper: Process file
const processFile = (file, callback) => {
  if (file.size > 20 * 1024 * 1024) {
    alert("Fichier trop lourd (>20Mo)");
    return;
  }
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

export default function Home() {
  // States
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // true = visible par défaut sur desktop

  // File states
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [refAttachments, setRefAttachments] = useState([]);
  const [realAttachments, setRealAttachments] = useState([]);

  // Feature states
  const [showDashboard, setShowDashboard] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [enableStreaming, setEnableStreaming] = useState(true);
  const [simulatorData, setSimulatorData] = useState(null);

  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const sessionId = getSessionId();

  // Hooks
  const { shouldShowButton, githubUrl, documentationContent } = useGithubDocButton(
    messages,
    activeChatId
  );

  // Firebase subscriptions
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
      setMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
  }, [activeChatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Handlers
  const handleAttach = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      processFile(file, (data) => {
        setRefAttachments((p) => [...p, data]);
      });
    });
    e.target.value = null;
  };

  const handleRemoveAttachment = (index) => {
    setRefAttachments((p) => p.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    const displayMessage = input;
    const technicalPrompt = input;

    if (!technicalPrompt && refAttachments.length === 0 && realAttachments.length === 0) return;

    setLoading(true);
    let chatId = activeChatId;

    try {
      // Upload files via server-side API
      const uploadAll = async (list) => {
        const results = await Promise.all(
          list.map(async (f) => {
            try {
              const res = await fetch("/api/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ file: f.data, fileType: f.type }),
              });
              const data = await res.json();
              return { type: f.type, url: data.url || "" };
            } catch (err) {
              console.error("Upload error:", err);
              return { type: f.type, url: "" };
            }
          })
        );
        return results.filter((r) => r.url);
      };

      const [upRef, upReal] = await Promise.all([
        uploadAll(refAttachments),
        uploadAll(realAttachments),
      ]);

      console.log("Uploaded files:", {
        refCount: upRef.length,
        realCount: upReal.length,
        refUrls: upRef.map((r) => r.url),
        realUrls: upReal.map((r) => r.url),
      });

      // Create conversation if needed
      if (!chatId) {
        const docRef = await addDoc(collection(db, "conversations"), {
          sessionId,
          title: "Nouvelle conversation",  // Titre temporaire, sera remplacé par l'API
          updatedAt: serverTimestamp(),
        });
        chatId = docRef.id;
        setActiveChatId(chatId);
      }

      // Save user message
      await addDoc(collection(db, "conversations", chatId, "messages"), {
        role: "user",
        text: displayMessage,
        files: [...upRef, ...upReal],
        isCompare: isCompareMode,
        createdAt: serverTimestamp(),
      });

      // Call API
      const history = messages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }));

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: technicalPrompt,
          referenceFiles: upRef,
          realityFiles: upReal,
          isCompare: isCompareMode,
          sessionId: chatId,
          history,
          enableStreaming,
        }),
      });

      console.log("API response:", response.status);

      if (enableStreaming && response.headers.get("content-type")?.includes("text/event-stream")) {
        handleStreamingResponse(response, chatId);
      } else {
        const data = await response.json();
        await addDoc(collection(db, "conversations", chatId, "messages"), {
          role: "assistant",
          text: data.analysis || "Erreur",
          githubUrl: data.githubUrl,
          createdAt: serverTimestamp(),
        });

        // Générer un titre pour la conversation
        try {
          await fetch("/api/generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId,
              aiFirstResponse: data.analysis || "Analyse Technique",
            }),
          });
        } catch (titleError) {
          console.error("Erreur génération titre:", titleError);
        }
      }

      setInput("");
      setRefAttachments([]);
      setRealAttachments([]);
    } catch (error) {
      console.error("Error:", error);
      alert("Erreur lors de l'analyse.");
    } finally {
      setLoading(false);
    }
  };

  const handleStreamingResponse = async (response, chatId) => {
    console.log("handleStreamingResponse started");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = "";

    const tempMsgRef = await addDoc(collection(db, "conversations", chatId, "messages"), {
      role: "assistant",
      text: "",
      isStreaming: true,
      createdAt: serverTimestamp(),
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("Streaming done");
          break;
        }

        const chunk = decoder.decode(value);
        console.log("Chunk received:", chunk);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log("Data event:", data.event, data.text ? data.text.substring(0, 50) : "");

              if (data.text) {
                accumulatedText += data.text;
                await updateDoc(doc(db, "conversations", chatId, "messages", tempMsgRef.id), {
                  text: accumulatedText,
                });
              }

              if (data.event === "complete") {
                console.log("Streaming complete");
                await updateDoc(doc(db, "conversations", chatId, "messages", tempMsgRef.id), {
                  isStreaming: false,
                  ...(data.data?.githubUrl && { githubUrl: data.data.githubUrl }),
                  ...(data.data?.metadata?.bugsFound !== undefined && {
                    bugsFound: data.data.metadata.bugsFound,
                  }),
                  ...(data.data?.metadata?.componentsFound !== undefined && {
                    componentsFound: data.data.metadata.componentsFound,
                  }),
                });

                // Générer un titre pour la conversation
                try {
                  const titleRes = await fetch("/api/generate-title", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      chatId,
                      aiFirstResponse: accumulatedText,
                    }),
                  });
                  const titleData = await titleRes.json();
                  console.log("Title generated:", titleData.title);
                } catch (titleError) {
                  console.error("Erreur génération titre:", titleError);
                }

                if (data.data?.metadata?.componentsFound > 0) {
                  setSimulatorData({ code: accumulatedText, components: [] });
                  setShowSimulator(true);
                }
              }
            } catch (e) {
              console.error("Parse error:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
    }
  };

  const resetConversation = () => {
    if (confirm("Démarrer un nouveau projet ?")) {
      setMessages([]);
      setInput("");
      setRefAttachments([]);
      setRealAttachments([]);
      setActiveChatId(null);
      setSimulatorData(null);
    }
  };

  const toggleDashboard = () => {
    setShowDashboard(!showDashboard);
    if (!showDashboard) {
      setShowSimulator(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <ConversationList
        conversations={conversations}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onNewChat={resetConversation}
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-gray-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-purple-500" />
            <span className="font-semibold">CircuitVision AI</span>
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="w-9" />
        </header>

        {/* Messages Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Dashboard Toggle - Desktop */}
          <div className="hidden lg:flex justify-end gap-2 mb-2">
            <button
              onClick={toggleDashboard}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                showDashboard
                  ? "bg-purple-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </button>
          </div>

          {/* Dashboard */}
          {showDashboard && (
            <div className="mb-6">
              <AnalyticsDashboard sessionId={sessionId} />
            </div>
          )}

          {/* Welcome Screen */}
          {messages.length === 0 && !showDashboard && (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
              <div className="text-center max-w-lg">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-purple-500/20">
                  <Cpu className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  Bienvenue sur CircuitVision AI
                </h2>
                <p className="text-gray-400 mb-6">
                  Analysez vos circuits embarqués en quelques secondes. Collez un lien GitHub ou
                  décrivez votre projet.
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="w-5 h-5 text-blue-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                        />
                      </svg>
                    </div>
                    <p className="font-medium text-white">Bug Detection</p>
                    <p className="text-xs text-gray-500 mt-1">Détection automatique</p>
                  </div>
                  <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                    <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="w-5 h-5 text-green-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                    </div>
                    <p className="font-medium text-white">Shopping List</p>
                    <p className="text-xs text-gray-500 mt-1">Composants détectés</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* Loading */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl rounded-tl-sm p-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <span
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Simulator */}
        {showSimulator && simulatorData && (
          <div className="border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm p-4">
            <div className="max-w-4xl mx-auto">
              <WokwiSimulator
                code={simulatorData.code}
                components={simulatorData.components}
                onSimulationStart={() => {}}
                onSimulationStop={() => {}}
              />
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="border-t border-gray-800 bg-gray-900">
          <div className="max-w-3xl mx-auto">
            {/* Mode Toggle */}
            <div className="flex items-center gap-4 px-4 py-2">
              <button
                onClick={() => setIsCompareMode(!isCompareMode)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                  isCompareMode
                    ? "bg-purple-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Mode comparaison
              </button>
            </div>

            {/* Input */}
            <ChatInput
              input={input}
              setInput={setInput}
              onSend={sendMessage}
              loading={loading}
              attachments={refAttachments}
              onAttach={handleAttach}
              onRemoveAttachment={handleRemoveAttachment}
              isCompareMode={isCompareMode}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
