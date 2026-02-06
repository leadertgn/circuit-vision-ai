"use client";
import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { sanitizeMermaidCode, generateFallbackDiagram } from "@/lib/mermaid-validator";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "Inter, sans-serif",
  flowchart: {
    htmlLabels: true,
    curve: "basis",
  },
});

export default function Mermaid({ chart }) {
  const ref = useRef(null);
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState("");
  const [showRawCode, setShowRawCode] = useState(false);

  useEffect(() => {
    if (!ref.current || !chart) return;

    let isMounted = true;
    const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

    const renderChart = async () => {
      try {
        setHasError(false);
        setErrorDetails("");

        // ÉTAPE 1 : Nettoyage et sanitization
        const cleanedChart = sanitizeMermaidCode(chart);

        if (!cleanedChart) {
          throw new Error("Code Mermaid invalide ou vide après nettoyage");
        }

        // ÉTAPE 2 : Test de parsing
        try {
          await mermaid.parse(cleanedChart);
        } catch (parseError) {
          // Utiliser le diagramme de fallback
          const fallbackChart = generateFallbackDiagram(parseError.message);
          await mermaid.parse(fallbackChart);

          const { svg } = await mermaid.render(id, fallbackChart);
          if (isMounted && ref.current) {
            ref.current.innerHTML = svg;
          }

          setHasError(true);
          setErrorDetails(parseError.message);
          return;
        }

        // ÉTAPE 3 : Rendu du diagramme nettoyé
        const { svg } = await mermaid.render(id, cleanedChart);

        if (isMounted && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        console.error("❌ Erreur Mermaid critique:", err);

        if (isMounted) {
          setHasError(true);
          setErrorDetails(err.message || "Erreur inconnue");

          // Afficher un message d'erreur visuel
          if (ref.current) {
            ref.current.innerHTML = `
              <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p class="text-red-600 font-semibold">⚠️ Impossible d'afficher le diagramme</p>
                <p class="text-sm text-red-500 mt-2">${err.message}</p>
              </div>
            `;
          }
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [chart]);

  if (hasError) {
    return (
      <div className="my-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm font-semibold text-red-600">⚠️ Diagramme non généré</p>
          <button
            onClick={() => setShowRawCode(!showRawCode)}
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            {showRawCode ? "Masquer le code" : "Voir le code brut"}
          </button>
        </div>

        <p className="text-xs text-red-500 mb-2">{errorDetails}</p>

        {showRawCode && (
          <pre className="mt-3 p-3 bg-gray-100 rounded text-xs overflow-x-auto">
            <code>{chart}</code>
          </pre>
        )}

        <div ref={ref} className="mt-3" />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="flex justify-center my-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto"
    />
  );
}
