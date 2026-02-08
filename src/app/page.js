"use client";

import React, { useState, useRef, useEffect } from "react";
import { Menu, BarChart3, Cpu, Zap, Copy } from "lucide-react";
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
import { useLanguage } from "@/hooks/useLanguage";

// Components
import { ConversationList } from "@/components/sidebar/ConversationList";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import WokwiSimulator from "@/components/WokwiSimulator";

// Helper: Process file
const processFile = (file, callback) => {
  if (file.size > 20 * 1024 * 1024) {
    alert("File too large (>20MB)");
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
// ✅ Helper function pour extraire composants (ajouter ligne ~110)
function extractComponentsForSimulator(markdown) {
  const tableRegex = /\|\s*([^|]+)\s*\|\s*(GPIO\d+|D\d+|A\d+|Pin\s*\d+)\s*\|/gi;
  const components = [];
  let match;

  while ((match = tableRegex.exec(markdown)) !== null) {
    const componentName = match[1].trim();
    const pinName = match[2].trim();

    // Skip header row
    if (
      componentName.toLowerCase().includes("component") ||
      componentName.toLowerCase().includes("composant")
    ) {
      continue;
    }

    components.push({
      component: componentName,
      pin: pinName,
    });
  }

  return components.slice(0, 10); // Max 10 for Wokwi
}
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

  const scrollRef = useRef(null);
  const sessionId = getSessionId();

  // Language detection hook
  const { language: userLanguage, isLoading: langLoading } = useLanguage();

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
    if (!activeChatId) return;

    // Check if simulator data exists in last message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage?.arduinoCode) {
      const components = extractComponentsForSimulator(lastMessage.text);
      if (components.length > 0) {
        setSimulatorData({
          code: lastMessage.arduinoCode,
          components: components,
          connections: [],
        });
        setShowSimulator(true);
      }
    }
  }, [messages, activeChatId]);

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
          title: "New conversation", // Titre temporaire, sera remplacé par l'API
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
          userLanguage,
        }),
      });

      console.log("API response:", response.status);

      if (enableStreaming && response.headers.get("content-type")?.includes("text/event-stream")) {
        // Detect GitHub URL from input
        const githubUrlMatch = input.match(/https:\/\/github\.com\/[^\s]+/);
        const detectedGithubUrl = githubUrlMatch ? githubUrlMatch[0] : null;
        handleStreamingResponse(response, chatId, detectedGithubUrl);
      } else {
        const data = await response.json();
        await addDoc(collection(db, "conversations", chatId, "messages"), {
          role: "assistant",
          text: data.analysis || "Error",
          githubUrl: data.githubUrl,
          createdAt: serverTimestamp(),
        });

        // Enable simulator if components detected (non-streaming mode)
        if (data.metadata?.componentsFound > 0 && data.arduinoCode) {
          setSimulatorData({
            code: data.arduinoCode,
            components: Array(data.metadata.componentsFound)
              .fill(null)
              .map((_, i) => ({
                component: "Component",
                pin: "GPIO" + (i + 1),
              })),
          });
          setShowSimulator(true);
        }

        // Generate title for conversation
        try {
          await fetch("/api/generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatId,
              userFirstQuery: input,
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
      alert("Analysis error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleStreamingResponse = async (response, chatId, githubUrl) => {
    console.log("🔄 Streaming started");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = "";
    let bugsData = null;
    let shoppingData = null;

    // Create temporary message
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
          console.log("✅ Streaming complete");
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          // Gérer les events SSE
          if (line.startsWith("event: ")) {
            const eventType = line.slice(7).trim();
            console.log("📡 Event:", eventType);
            continue;
          }

          // Gérer les data SSE
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              // Streaming du texte
              if (data.text) {
                accumulatedText += data.text;
                await updateDoc(doc(db, "conversations", chatId, "messages", tempMsgRef.id), {
                  text: accumulatedText,
                });
              }

              // Bugs détected
              if (data.bugs && data.bugs.length > 0) {
                bugsData = data;
                console.log("🐛 Bugs détectés:", data.bugs.length);
              }

              // Shopping list
              if (data.items && data.items.length > 0) {
                shoppingData = data;
                console.log("🛒 Components:", data.items.length);
              }
            } catch (e) {
              if (line.trim() !== "") {
                console.warn("⚠️ Parse error:", e.message);
              }
            }
          }
        }
      }

      // Finalize message with githubUrl
      await updateDoc(doc(db, "conversations", chatId, "messages", tempMsgRef.id), {
        isStreaming: false,
        bugsFound: bugsData?.bugs?.length || 0,
        componentsFound: shoppingData?.items?.length || 0,
        githubUrl: githubUrl,
      });

      // Generate conversation title
      if (accumulatedText.length > 50) {
        fetch("/api/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            aiFirstResponse: accumulatedText.substring(0, 300),
          }),
        }).catch(console.error);
      }

      // Enable simulator if components detected
      if (shoppingData && shoppingData.items.length > 0) {
        // Use arduinoCode instead of accumulatedText (markdown)
        const arduinoCode =
          accumulatedText.match(/```(?:arduino|cpp)?\n([\s\S]*?)```/)?.[1]?.trim() ||
          "// Arduino code will appear here\n\nvoid setup() {\n  // Your code here\n}\n\nvoid loop() {\n  // Your code here\n}";

        setSimulatorData({
          code: arduinoCode,
          components: shoppingData.items.map((item) => ({
            component: item.component,
            pin: "GPIO" + Math.floor(Math.random() * 30),
          })),
        });
        setShowSimulator(true);
      }
    } catch (error) {
      console.error("❌ Streaming error:", error);
      await updateDoc(doc(db, "conversations", chatId, "messages", tempMsgRef.id), {
        text: accumulatedText || "Streaming error",
        isStreaming: false,
      });
    }
  };

  const resetConversation = () => {
    if (confirm("Start a new project?")) {
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
                <h2 className="text-2xl font-bold text-white mb-3">Welcome to CircuitVision AI</h2>
                <p className="text-gray-400 mb-6">
                  Analyze embedded circuits in seconds.Paste a GitHub URL or describe your project
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
                    <p className="text-xs text-gray-500 mt-1">Automatic detection</p>
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
                    <p className="text-xs text-gray-500 mt-1">Components detected</p>
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

        {/* Simulator - CORRECTED VERSION with persistence */}
        {showSimulator && simulatorData && (
          <WokwiSimulator
            code={simulatorData.code}
            components={simulatorData.components}
            connections={simulatorData.connections || []}
            chatId={activeChatId} // ✅ NEW: Pass chatId for persistence
            onSimulationStart={() => console.log("Simulation started")}
            onSimulationStop={() => console.log("Simulation stopped")}
          />
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
                <Copy className="w-4 h-4" />
                Compare mode
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
