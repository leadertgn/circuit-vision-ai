"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import Mermaid from "@/components/Mermaid";
import { Copy, Check, AlertCircle } from "lucide-react";

export function ChatMessage({ message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(message.text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render attached files (images)
  const renderFiles = () => {
    if (!message.files || message.files.length === 0) return null;

    return (
      <div className="flex gap-2 mt-3 flex-wrap">
        {message.files.map((file, index) => (
          <div key={index} className="relative group">
            {file.type?.startsWith("image") ? (
              <img 
                src={file.url} 
                alt={`Fichier ${index + 1}`}
                className="max-w-xs max-h-48 rounded-lg border border-gray-700"
              />
            ) : file.type?.startsWith("video") ? (
              <video 
                src={file.url} 
                controls
                className="max-w-xs max-h-48 rounded-lg border border-gray-700"
              />
            ) : (
              <a 
                href={file.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 text-sm"
              >
                📎 {file.name || "Fichier"}
              </a>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`flex gap-4 p-4 ${isUser ? "bg-gray-900/50" : "bg-transparent"}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? "bg-gray-700" : "bg-gradient-to-br from-purple-500 to-blue-500"
      }`}>
        {isUser ? (
          <span className="text-sm font-medium text-white">U</span>
        ) : (
          <span className="text-sm font-medium text-white">AI</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isUser ? (
          <div className="prose prose-invert max-w-none">
            <p className="text-gray-100 whitespace-pre-wrap">{message.text}</p>
            {renderFiles()}
          </div>
        ) : (
          <div className="space-y-4">
            {/* AI Response with Markdown */}
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const lang = match?.[1];

                    if (lang === "mermaid") {
                      return <Mermaid chart={String(children).replace(/\n$/, "")} />;
                    }

                    return (
                      <div className="relative group">
                        <code className={className} {...props}>
                          {children}
                        </code>
                        {!inline && (
                          <button
                            onClick={copyToClipboard}
                            className="absolute top-2 right-2 p-1 rounded bg-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy code"
                          >
                            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                          </button>
                        )}
                      </div>
                    );
                  },
                }}
              >
                {message.text || ""}
              </ReactMarkdown>
            </div>

            {/* Metadata badges */}
            {(message.bugsFound > 0 || message.componentsFound > 0) && (
              <div className="flex gap-2 flex-wrap">
                {message.bugsFound > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs">
                    <AlertCircle className="w-3 h-3" />
                    {message.bugsFound} bug{message.bugsFound > 1 ? "s" : ""}
                  </span>
                )}
                {message.componentsFound > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs">
                    {message.componentsFound} composant{message.componentsFound > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
