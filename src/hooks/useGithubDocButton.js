// REMPLACER src/hooks/useGithubDocButton.js entièrement par :

import { useState, useEffect } from "react";
import { isDocumentationComplete } from "@/lib/doc-completion-detector";

export function useGithubDocButton(messages, activeChatId) {
  const [shouldShowButton, setShouldShowButton] = useState(false);
  const [githubUrl, setGithubUrl] = useState(null);
  const [documentationMessage, setDocumentationMessage] = useState(null);

  useEffect(() => {
    if (!messages || messages.length === 0) {
      setShouldShowButton(false);
      return;
    }

    // Filtrer messages AI et utilisateur
    const aiMessages = messages.filter((m) => m.role === "assistant");
    const userMessages = messages.filter((m) => m.role === "user");

    if (aiMessages.length === 0) {
      setShouldShowButton(false);
      return;
    }

    // Trouver dernière URL GitHub dans messages utilisateur
    let detectedGithubUrl = null;
    for (let i = userMessages.length - 1; i >= 0; i--) {
      // ✅ CORRECTION : Utiliser .text pas .content
      const match = userMessages[i].text?.match(/https:\/\/github\.com\/[^\s]+/);
      if (match) {
        detectedGithubUrl = match[0];
        break;
      }
    }

    // Vérifier dernière réponse AI
    const lastAiMessage = aiMessages[aiMessages.length - 1];
    const lastUserMessage = userMessages[userMessages.length - 1];

    // Ne pas afficher si continuation
    const isContinuation = lastUserMessage?.text?.toLowerCase().includes("continue");

    // ✅ CORRECTION : Utiliser .text pour vérifier completion
    if (detectedGithubUrl && !isContinuation && isDocumentationComplete(lastAiMessage.text)) {
      setShouldShowButton(true);
      setGithubUrl(detectedGithubUrl);
      setDocumentationMessage(lastAiMessage);
    } else {
      setShouldShowButton(false);
      setGithubUrl(null);
      setDocumentationMessage(null);
    }
  }, [messages, activeChatId]);

  return {
    shouldShowButton,
    githubUrl,
    // ✅ CORRECTION : Utiliser .text pas .content
    documentationContent: documentationMessage?.text,
  };
}