"use client";

import React, { useState, useRef } from "react";
import { Send, Paperclip, X, FileText, FileVideo } from "lucide-react";

export function ChatInput({
  input,
  setInput,
  onSend,
  loading,
  attachments,
  onAttach,
  onRemoveAttachment,
  isCompareMode,
}) {
  const fileInputRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="sticky bottom-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 p-4">
      <div className="max-w-3xl mx-auto">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {attachments.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-300"
              >
                {file.type.startsWith("video") ? (
                  <FileVideo className="w-4 h-4" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span className="truncate max-w-[150px]">{file.name}</span>
                <button
                  onClick={() => onRemoveAttachment(i)}
                  className="p-0.5 hover:bg-gray-700 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input container */}
        <div
          className={`flex items-end gap-2 p-3 rounded-2xl border transition-all ${
            isFocused
              ? "border-purple-500 bg-gray-800 ring-2 ring-purple-500/20"
              : "border-gray-700 bg-gray-800/50"
          }`}
        >
          {/* Attachment buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            {isCompareMode && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                title="Real circuit photo"
              >
                <FileVideo className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Text input */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Paste a GitHub URL or describe your circuit..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none focus:outline-none max-h-48"
            rows={1}
            disabled={loading}
          />

          {/* Send button */}
          <button
            onClick={onSend}
            disabled={loading || (!input.trim() && attachments.length === 0)}
            className={`p-2 rounded-xl transition-all ${
              loading || (!input.trim() && attachments.length === 0)
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500"
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={onAttach}
          accept="image/*,video/*"
          multiple
          className="hidden"
        />

        {/* Help text */}
        <p className="text-center text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
