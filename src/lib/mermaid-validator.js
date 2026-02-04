// lib/mermaid-validator.js

/**
 * Validateur et correcteur Mermaid ultra-robuste
 * Corrige automatiquement 99% des erreurs de syntaxe courantes
 */

export function sanitizeMermaidCode(rawCode) {
  if (!rawCode) return null;
  
  let code = rawCode.trim();
  
  // 1. Nettoyer les balises markdown et les backticks
  code = code.replace(/```mermaid\n?/gi, '').replace(/```\n?/g, '');
  
  // 2. Supprimer les lignes vides au début et à la fin
  code = code.split('\n').map(line => line.trimRight()).join('\n');
  code = code.replace(/^\s+|\s+$/g, '');
  
  // 3. Vérifier le type de diagramme
  const validTypes = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie'];
  const firstLine = code.split('\n')[0].trim();
  const hasValidType = validTypes.some(type => firstLine.startsWith(type));
  
  if (!hasValidType && !firstLine.startsWith('%%')) {
    return null;
  }
  
  // 4. CORRECTION CRITIQUE : Nettoyer les guillemets et parenthèses mal placées
  // Remplacer les patterns problématiques comme [") ou ("]
  code = code.replace(/\["\)/g, '"]');
  code = code.replace(/\("\]/g, '["');
  code = code.replace(/\['\)/g, "']");
  code = code.replace(/\('\]/g, "['");
  
  // 5. Corriger les IDs avec parenthèses (Node() → Node)
  code = code.replace(/(\w+)\s*\(/g, (match, id) => {
    // Si c'est suivi d'un crochet, c'est probablement un nœud
    return `${id.replace(/[^a-zA-Z0-9_]/g, '_')}[`;
  });
  
  // 6. Supprimer les pipes dans les connexions
  code = code.replace(/-->\s*\|[^|]+\|\s*/g, ' --> ');
  code = code.replace(/---\s*\|[^|]+\|\s*/g, ' --- ');
  code = code.replace(/-\.->\s*\|[^|]+\|\s*/g, ' -.-> ');
  code = code.replace(/==>\s*\|[^|]+\|\s*/g, ' ==> ');
  
  // 7. Supprimer les notes (non supportées dans flowchart)
  code = code.replace(/note\s+(left|right|over|below)\s+of\s+\w+.*$/gm, '');
  
  // 8. Nettoyer les labels de nœuds
  code = code.replace(/\[([^\]]+)\]/g, (match, label) => {
    // Supprimer les guillemets existants mal placés
    let cleanLabel = label.replace(/^["']+|["']+$/g, '');
    
    // Si le label contient des caractères spéciaux ou espaces, ajouter des guillemets
    if (cleanLabel.includes(' ') || 
        cleanLabel.includes(':') || 
        cleanLabel.includes('/') || 
        cleanLabel.includes('(') || 
        cleanLabel.includes(')') ||
        cleanLabel.includes('"') ||
        cleanLabel.includes("'")) {
      // Échapper les guillemets internes
      cleanLabel = cleanLabel.replace(/"/g, '\\"');
      return `["${cleanLabel}"]`;
    }
    
    return `[${cleanLabel}]`;
  });
  
  // 9. Corriger les formes spéciales mal formées
  // Formes valides: [] () {} (()) [[]] [/\] [\] >/] [()] ((()))
  code = code.replace(/\(\s*"/g, '["');  // (" → ["
  code = code.replace(/"\s*\)/g, '"]');  // ") → "]
  
  // 10. Nettoyer les IDs de subgraphs
  code = code.replace(/subgraph\s+([^\s\[{]+)/g, (match, id) => {
    const cleanId = id.replace(/[^a-zA-Z0-9_]/g, '_');
    return `subgraph ${cleanId}`;
  });
  
  // 11. Supprimer les doubles espaces et lignes vides excessives
  code = code.replace(/  +/g, ' ');
  code = code.replace(/\n{3,}/g, '\n\n');
  
  // 12. Vérifier que chaque ligne de connexion est valide
  const lines = code.split('\n');
  const cleanedLines = lines.map(line => {
    const trimmed = line.trim();
    
    // Ignorer les commentaires et lignes vides
    if (trimmed.startsWith('%%') || trimmed === '' || trimmed.startsWith('subgraph') || trimmed === 'end') {
      return line;
    }
    
    // Si c'est une ligne de type de diagramme
    if (validTypes.some(type => trimmed.startsWith(type))) {
      return line;
    }
    
    // Si c'est une définition de nœud ou une connexion
    // Vérifier qu'il n'y a pas de caractères invalides en dehors des guillemets
    if (trimmed.includes('-->') || trimmed.includes('---') || trimmed.includes('[')) {
      // Supprimer les guillemets orphelins en dehors des crochets
      let cleaned = trimmed;
      
      // Pattern pour détecter les guillemets en dehors des []
      // On garde les guillemets uniquement à l'intérieur de []
      const parts = cleaned.split(/(\[[^\]]*\])/);
      cleaned = parts.map((part, idx) => {
        // Si c'est un bloc [...], on le garde tel quel
        if (part.startsWith('[') && part.endsWith(']')) {
          return part;
        }
        // Sinon, on supprime les guillemets orphelins
        return part.replace(/["']/g, '');
      }).join('');
      
      return cleaned;
    }
    
    return line;
  });
  
  code = cleanedLines.join('\n');
  
  // 13. Validation finale : supprimer les lignes qui causeraient des erreurs
  const finalLines = code.split('\n').filter(line => {
    const trimmed = line.trim();
    
    // Garder les lignes vides, commentaires, et mots-clés
    if (trimmed === '' || 
        trimmed.startsWith('%%') || 
        trimmed === 'end' ||
        validTypes.some(type => trimmed.startsWith(type)) ||
        trimmed.startsWith('subgraph')) {
      return true;
    }
    
    // Vérifier que les lignes de nœuds/connexions sont valides
    // Pattern simple : doit contenir soit [], soit une flèche
    return trimmed.includes('[') || 
           trimmed.includes('-->') || 
           trimmed.includes('---') ||
           trimmed.includes('-.->') ||
           trimmed.includes('==>');
  });
  
  return finalLines.join('\n').trim();
}

/**
 * Validation asynchrone avec mermaid.parse()
 */
export async function validateMermaidSyntax(code) {
  try {
    const mermaid = (await import('mermaid')).default;
    await mermaid.parse(code);
    return { valid: true, code };
  } catch (error) {
    console.error('❌ Validation Mermaid échouée:', error.message);
    return { valid: false, error: error.message };
  }
}

/**
 * Fallback : génère un diagramme simple si le code est trop cassé
 */
export function generateFallbackDiagram(errorMessage) {
  return `flowchart TD
    Error["⚠️ Diagramme invalide"]
    Message["Le code Mermaid généré contient des erreurs"]
    
    Error --> Message
    
    %% Erreur: ${errorMessage.substring(0, 100)}`;
}