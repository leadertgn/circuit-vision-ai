// hooks/useGithubDocButton.js
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

    // Chercher la dernière réponse AI avec un lien GitHub
    const aiMessages = messages.filter((m) => m.role === "assistant");
    const userMessages = messages.filter((m) => m.role === "user");

    if (aiMessages.length === 0) {
      setShouldShowButton(false);
      return;
    }

    // Trouver le dernier message utilisateur avec GitHub URL
    let detectedGithubUrl = null;
    for (let i = userMessages.length - 1; i >= 0; i--) {
      // Utiliser 'text' au lieu de 'content' (propriété correcte)
      const match = userMessages[i].text?.match(/https:\/\/github\.com\/[^\s]+/);
      if (match) {
        detectedGithubUrl = match[0];
        break;
      }
    }

    // Vérifier la dernière réponse AI
    const lastAiMessage = aiMessages[aiMessages.length - 1];
    const lastUserMessage = userMessages[userMessages.length - 1];

    // Ne pas afficher si l'utilisateur a dit "continue"
    const isContinuation = lastUserMessage?.text?.toLowerCase().includes("continue");

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
    documentationContent: documentationMessage?.text,
  };
}
