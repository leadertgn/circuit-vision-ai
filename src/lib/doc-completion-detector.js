// lib/doc-completion-detector.js

/**
 * Détecte si une réponse AI contient une documentation complète
 * prête à être envoyée sur GitHub
 */
export function isDocumentationComplete(aiResponse) {
  if (!aiResponse || aiResponse.length < 800) return false;
  
  // Sections obligatoires (plus flexible dans la détection)
  const requiredSections = [
    /vue\s+d'ensemble|overview|présentation|objectif/i,
    /composants?\s+(hardware|matériel)|liste\s+des\s+composants/i,
    /pins?|configuration|câblage|brochage/i,
    /bibliothèques?|dépendances|libraries/i,
    /installation|procédure|setup/i,
  ];
  
  // Compter combien de sections requises sont présentes
  const matchCount = requiredSections.filter(regex => regex.test(aiResponse)).length;
  
  // Vérifier la présence d'un diagramme Mermaid OU d'un schéma
  const hasMermaid = /```mermaid/i.test(aiResponse) || /schéma|diagram/i.test(aiResponse);
  
  // Documentation complète = au moins 4 sections + diagramme/schéma
  const isComplete = matchCount >= 4 && hasMermaid;
  
  // Log pour debugging
  if (typeof console !== 'undefined') {
    console.log('📊 Détection doc complète:', {
      sections: matchCount,
      hasDiagram: hasMermaid,
      isComplete,
      length: aiResponse.length
    });
  }
  
  return isComplete;
}

/**
 * Extrait l'URL GitHub d'une requête utilisateur
 */
export function extractGithubUrl(userInput) {
  const match = userInput?.match(/https:\/\/github\.com\/[^\s]+/);
  return match ? match[0] : null;
}

/**
 * Détermine si on doit afficher le bouton d'envoi GitHub
 */
export function shouldShowGithubButton(aiResponse, userInput, hasGithubUrl) {
  // Ne pas afficher si continuation en cours
  const isContinuation = userInput?.toLowerCase().includes('continue') ||
                         userInput?.toLowerCase().includes('suite');
  
  return (
    hasGithubUrl && 
    isDocumentationComplete(aiResponse) &&
    !isContinuation
  );
}