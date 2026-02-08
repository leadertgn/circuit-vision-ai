import { z } from "zod";

// Schéma pour un composant hardware
export const HardwareComponentSchema = z.object({
  component: z.string().describe("Nom du composant (ex: ESP32, DHT22)"),
  pin: z.string().describe("Pin utilisé (ex: GPIO15, D4)"),
  function: z.string().describe("Fonction du composant"),
  voltage: z.string().optional().describe("Voltage requis (ex: 3.3V, 5V)"),
  notes: z.string().optional().describe("Notes importantes"),
});

// Schéma pour une bibliothèque
export const LibrarySchema = z.object({
  name: z.string().describe("Nom de la bibliothèque"),
  purpose: z.string().describe("Rôle dans le projet"),
  version: z.string().optional().describe("Version recommandée"),
});

// Schéma pour une étape d'installation
export const InstallStepSchema = z.object({
  step_number: z.number().describe("Numéro de l'étape"),
  title: z.string().describe("Titre de l'étape"),
  description: z.string().describe("Description détaillée"),
  code: z.string().optional().describe("Code ou commande à exécuter"),
});

// Schéma pour bug détecté
export const HardwareBugSchema = z.object({
  severity: z.enum(["critical", "warning", "info"]).describe("Niveau de gravité"),
  type: z.string().describe("Type de bug (ex: pin_conflict, voltage_mismatch)"),
  description: z.string().describe("Description du problème"),
  location: z.string().describe("Fichier et ligne concernés"),
  suggestion: z.string().describe("Solution recommandée"),
});

// Schéma pour un composant à acheter
export const ShoppingItemSchema = z.object({
  component: z.string().describe("Nom du composant"),
  quantity: z.number().describe("Quantité nécessaire"),
  estimated_price: z.string().optional().describe("Prix estimé"),
  purchase_links: z.array(z.string()).optional().describe("Liens d'achat"),
  alternatives: z.array(z.string()).optional().describe("Composants alternatifs"),
});

// SCHÉMA PRINCIPAL - Documentation complète
export const DocumentationSchema = z.object({
  overview: z.object({
    title: z.string().describe("Titre du projet"),
    description: z.string().describe("Description en 2-3 phrases"),
    architecture: z.string().describe("Architecture globale"),
  }),

  hardware: z.array(HardwareComponentSchema).describe("Liste des composants hardware"),

  pin_configuration: z.string().describe("Code source des #define et déclarations de pins"),

  libraries: z.array(LibrarySchema).describe("Bibliothèques et dépendances"),

  code_logic: z.object({
    setup_steps: z.array(z.string()).describe("Étapes du setup()"),
    loop_logic: z.string().describe("Logique de la loop()"),
    critical_functions: z.array(z.string()).describe("Fonctions critiques identifiées"),
  }),

  mermaid_diagram: z.string().describe("Code Mermaid du schéma de câblage"),

  installation: z.array(InstallStepSchema).describe("Procédure d'installation"),

  testing: z.object({
    hardware_checks: z.array(z.string()).describe("Points de contrôle hardware"),
    serial_checks: z.array(z.string()).describe("Vérifications Serial Monitor"),
    common_errors: z
      .array(
        z.object({
          error: z.string(),
          solution: z.string(),
        })
      )
      .describe("Erreurs courantes et solutions"),
  }),

  bugs_detected: z.array(HardwareBugSchema).optional().describe("Bugs hardware détectés"),

  shopping_list: z.array(ShoppingItemSchema).optional().describe("Liste de courses"),
});

// Schéma pour analyse comparative
export const ComparisonSchema = z.object({
  matches: z.array(z.string()).describe("Points de correspondance"),
  discrepancies: z
    .array(
      z.object({
        component: z.string(),
        expected: z.string(),
        actual: z.string(),
        severity: z.enum(["critical", "warning", "info"]),
      })
    )
    .describe("Écarts détectés"),
  missing_components: z.array(z.string()).describe("Composants manquants"),
  recommendations: z.array(z.string()).describe("Recommandations"),
});

// Export pour zodToJsonSchema
export const getDocumentationJsonSchema = () => DocumentationSchema;
export const getComparisonJsonSchema = () => ComparisonSchema;
