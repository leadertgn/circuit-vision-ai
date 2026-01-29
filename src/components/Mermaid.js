"use client";
import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// On initialise à l'extérieur pour éviter de le refaire à chaque rendu
mermaid.initialize({
  startOnLoad: false, // On gère le chargement manuellement
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "Inter, sans-serif",
});

export default function Mermaid({ chart }) {
  const ref = useRef(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // 1. Vérification de sécurité
    if (!ref.current || !chart) return;

    let isMounted = true; // Pour éviter de mettre à jour un composant démonté
    const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

    const renderChart = async () => {
      try {
        setHasError(false);
        // 2. Utilisation de la méthode de rendu asynchrone
        const { svg } = await mermaid.render(id, chart);

        // 3. On vérifie si le composant est toujours là avant de toucher au DOM
        if (isMounted && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        console.error("Erreur de rendu Mermaid:", err);
        if (isMounted) setHasError(true);
      }
    };

    renderChart();

    // 4. Nettoyage lors du démontage
    return () => {
      isMounted = false;
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [chart]);

  if (hasError) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">
        Erreur de syntaxe dans le diagramme.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="flex justify-center my-4 p-4 bg-white rounded-lg border border-slate-100 shadow-sm overflow-x-auto"
    />
  );
}
