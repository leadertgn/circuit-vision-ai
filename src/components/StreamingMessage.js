"use client";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import Mermaid from "./Mermaid";
import { AlertCircle, CheckCircle, ShoppingCart, Loader2 } from "lucide-react";

export default function StreamingMessage({
  message,
  onBugsDetected,
  onShoppingListGenerated,
  onComplete,
}) {
  const [displayedText, setDisplayedText] = useState("");
  const [status, setStatus] = useState("");
  const [bugsData, setBugsData] = useState(null);
  const [shoppingData, setShoppingData] = useState(null);
  const [isStreaming, setIsStreaming] = useState(true);

  useEffect(() => {
    // Utiliser 'text' au lieu de 'content' (propriété utilisée dans Firestore)
    if (!message.isStreaming) {
      setDisplayedText(message.text || "");
      setIsStreaming(false);
      return;
    }

    // Note: EventSource requiert une API SSE. Pour l'instant, le streaming
    // n'est pas implémenté côté backend. La réponse arrive en JSON complet.
    // Si message.streamUrl existe, on tente quand même la connexion :
    if (message.streamUrl) {
      const eventSource = new EventSource(message.streamUrl);

      eventSource.addEventListener("message", (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.text) {
            setDisplayedText((prev) => prev + data.text);
          }

          if (data.event === "status") {
            setStatus(data.data);
          }

          if (data.event === "bugs_detected") {
            setBugsData(data.data);
            onBugsDetected?.(data.data);
          }

          if (data.event === "shopping_list") {
            setShoppingData(data.data);
            onShoppingListGenerated?.(data.data);
          }

          if (data.event === "complete") {
            setIsStreaming(false);
            onComplete?.(data.data);
            eventSource.close();
          }

          if (data.event === "error") {
            console.error("Stream error:", data.data);
            setIsStreaming(false);
            eventSource.close();
          }
        } catch (err) {
          console.error("Parse error:", err);
        }
      });

      eventSource.onerror = (err) => {
        console.error("EventSource error:", err);
        setIsStreaming(false);
        eventSource.close();
      };

      return () => eventSource.close();
    } else {
      // Fallback: pas de streaming disponible, afficher directement
      setDisplayedText(message.text || "");
      setIsStreaming(false);
    }
  }, [message]);

  return (
    <div className="space-y-4">
      {/* Status bar */}
      {isStreaming && status && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span className="text-sm text-blue-700">{status}</span>
        </div>
      )}

      {/* Bugs détectés */}
      {bugsData && bugsData.stats.total > 0 && <BugsAlert bugs={bugsData} />}

      {/* Shopping list preview */}
      {shoppingData && shoppingData.items.length > 0 && (
        <ShoppingListPreview items={shoppingData.items} />
      )}

      {/* Contenu principal */}
      <div className="prose prose-slate max-w-none">
        <ReactMarkdown
          components={{
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              const lang = match?.[1];

              if (lang === "mermaid") {
                return <Mermaid chart={String(children).replace(/\n$/, "")} />;
              }

              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {displayedText}
        </ReactMarkdown>
      </div>

      {/* Cursor clignotant pendant streaming */}
      {isStreaming && <span className="inline-block w-2 h-4 bg-blue-600 animate-pulse ml-1"></span>}
    </div>
  );
}

// Composant pour afficher les bugs
function BugsAlert({ bugs }) {
  const { stats } = bugs;

  const getSeverityColor = () => {
    if (stats.critical > 0) return "red";
    if (stats.warnings > 0) return "yellow";
    return "blue";
  };

  const color = getSeverityColor();

  return (
    <div className={`p-4 bg-${color}-50 border border-${color}-200 rounded-lg`}>
      <div className="flex items-start gap-3">
        <AlertCircle className={`w-5 h-5 text-${color}-600 mt-0.5`} />
        <div className="flex-1">
          <h4 className={`font-semibold text-${color}-900 mb-2`}>
            🔍 {stats.total} problème(s) hardware détecté(s)
          </h4>
          <div className="space-y-1 text-sm">
            {stats.critical > 0 && (
              <div className="text-red-700">❌ {stats.critical} critique(s)</div>
            )}
            {stats.warnings > 0 && (
              <div className="text-yellow-700">⚠️ {stats.warnings} avertissement(s)</div>
            )}
            {stats.info > 0 && <div className="text-blue-700">ℹ️ {stats.info} info(s)</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Composant pour preview shopping list
function ShoppingListPreview({ items }) {
  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex items-start gap-3">
        <ShoppingCart className="w-5 h-5 text-green-600 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-semibold text-green-900 mb-2">
            🛒 {items.length} composant(s) détecté(s)
          </h4>
          <div className="text-sm text-green-700">Liste de courses générée automatiquement</div>
        </div>
      </div>
    </div>
  );
}
