"use client";

import React from "react";
import { MessageSquare, Plus, Cpu, Zap } from "lucide-react";

export function ConversationList({
  conversations,
  activeChatId,
  onSelectChat,
  onNewChat,
  isSidebarOpen,
  onCloseSidebar,
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-72 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-white">CircuitVision AI</span>
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <button onClick={onCloseSidebar} className="lg:hidden p-1 text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-500 hover:to-blue-500 transition-all text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No projects yet</p>
              <p className="text-xs mt-1">Create your first analysis</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectChat(conv.id)}
                className={`w-full text-left p-3 rounded-xl transition-all ${
                  activeChatId === conv.id
                    ? "bg-gray-800 text-white border border-gray-700"
                    : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.title || "Untitled"}</p>
                    {conv.updatedAt && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(conv.updatedAt?.seconds * 1000).toLocaleDateString("en-US")}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 text-center">Powered by Gemini 3</p>
      </div>
    </aside>
  );
}
