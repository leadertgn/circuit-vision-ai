"use client";
import { useState, useEffect } from 'react';
import { Play, Square, Zap, Code, Settings } from 'lucide-react';

/**
 * Wokwi Circuit Simulator Integration
 * Permet de visualiser et simuler le circuit directement dans CircuitVision
 * WOW FACTOR : Circuit vivant avec LEDs qui clignotent, sensors qui réagissent
 */

export default function WokwiSimulator({ 
  code, 
  components = [],
  connections = [],
  onSimulationStart,
  onSimulationStop 
}) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [wokwiConfig, setWokwiConfig] = useState(null);
  const [embedUrl, setEmbedUrl] = useState(null);

  useEffect(() => {
    if (code && components.length > 0) {
      generateWokwiConfig();
    }
  }, [code, components]);

  // Génère la configuration Wokwi à partir du code et composants
  const generateWokwiConfig = () => {
    const config = {
      version: 1,
      author: "CircuitVision AI",
      editor: "wokwi",
      parts: mapComponentsToWokwiParts(components),
      connections: mapToWokwiConnections(connections),
      diagram: generateDiagram(components, connections)
    };

    setWokwiConfig(config);

    // Créer l'URL embed Wokwi
    const projectData = {
      files: {
        'sketch.ino': code,
        'diagram.json': JSON.stringify(config)
      }
    };

    // Note: En production, il faudrait upload sur Wokwi API
    // Pour la démo, on génère un lien local
    const encodedData = encodeURIComponent(JSON.stringify(projectData));
    setEmbedUrl(`https://wokwi.com/projects/new?data=${encodedData}`);
  };

  // Mapping des composants CircuitVision vers Wokwi
  const mapComponentsToWokwiParts = (components) => {
    const wokwiParts = [];
    
    components.forEach((comp, idx) => {
      let wokwiType = null;
      
      // Mapping automatique
      const componentMap = {
        'ESP32': 'wokwi-esp32-devkit-v1',
        'Arduino Uno': 'wokwi-arduino-uno',
        'Arduino Nano': 'wokwi-arduino-nano',
        'DHT22': 'wokwi-dht22',
        'LED': 'wokwi-led',
        'Button': 'wokwi-pushbutton',
        'Servo': 'wokwi-servo',
        'LCD 16x2': 'wokwi-lcd1602',
        'Resistor': 'wokwi-resistor'
      };

      // Trouver le type Wokwi
      Object.entries(componentMap).forEach(([key, value]) => {
        if (comp.component?.includes(key)) {
          wokwiType = value;
        }
      });

      if (wokwiType) {
        wokwiParts.push({
          type: wokwiType,
          id: `part_${idx}`,
          top: 100 + (idx * 80),
          left: 100 + (idx % 3) * 150,
          attrs: comp.attrs || {}
        });
      }
    });

    return wokwiParts;
  };

  // Mapping des connexions
  const mapToWokwiConnections = (connections) => {
    return connections.map(conn => [
      `part_${conn.from}:${conn.fromPin}`,
      `part_${conn.to}:${conn.toPin}`,
      conn.color || 'green',
      []
    ]);
  };

  // Génère le diagramme de positionnement
  const generateDiagram = (components, connections) => {
    // Auto-layout simple (grid)
    const cols = 3;
    return components.map((comp, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      return {
        id: `part_${idx}`,
        x: 100 + col * 200,
        y: 100 + row * 150
      };
    });
  };

  // Démarrer la simulation
  const handleStartSimulation = () => {
    setIsSimulating(true);
    onSimulationStart?.();
  };

  // Arrêter la simulation
  const handleStopSimulation = () => {
    setIsSimulating(false);
    onSimulationStop?.();
  };

  // Export configuration Wokwi
  const handleExportConfig = () => {
    const blob = new Blob([JSON.stringify(wokwiConfig, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wokwi-diagram.json';
    a.click();
  };

  // Ouvrir dans Wokwi (nouvel onglet)
  const handleOpenInWokwi = () => {
    if (embedUrl) {
      window.open(embedUrl, '_blank');
    }
  };

  if (!code || components.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
        <Zap className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 mb-2">Simulation de circuit disponible</p>
        <p className="text-sm text-gray-500">
          Analysez un projet GitHub pour activer le simulateur Wokwi
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header avec contrôles */}
      <div className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600 rounded-lg">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              Circuit Simulator
            </h3>
            <p className="text-sm text-gray-600">
              Powered by Wokwi • {components.length} composants
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSimulating ? (
            <button
              onClick={handleStopSimulation}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleStartSimulation}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Play className="w-4 h-4" />
              Simuler
            </button>
          )}

          <button
            onClick={handleOpenInWokwi}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Code className="w-4 h-4" />
            Ouvrir dans Wokwi
          </button>

          <button
            onClick={handleExportConfig}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Exporter config"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Preview du circuit */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isSimulating ? (
          // Iframe Wokwi en simulation
          <div className="relative" style={{ paddingBottom: '56.25%', height: 0 }}>
            <iframe
              src={embedUrl}
              className="absolute top-0 left-0 w-full h-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Wokwi Circuit Simulator"
            />
          </div>
        ) : (
          // Preview statique du circuit
          <CircuitPreview 
            components={components} 
            connections={connections}
            config={wokwiConfig}
          />
        )}
      </div>

      {/* Informations du circuit */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Composants</p>
          <p className="text-2xl font-bold text-gray-900">{components.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Connexions</p>
          <p className="text-2xl font-bold text-gray-900">{connections.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Plateforme</p>
          <p className="text-lg font-bold text-purple-600">
            {components[0]?.component || 'ESP32'}
          </p>
        </div>
      </div>

      {/* Note */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <p className="text-sm text-blue-900">
          💡 <strong>Astuce :</strong> Le simulateur Wokwi permet de tester votre circuit 
          sans hardware physique. Les LEDs clignotent, les sensors réagissent en temps réel !
        </p>
      </div>
    </div>
  );
}

// Composant Preview statique du circuit
function CircuitPreview({ components, connections, config }) {
  return (
    <div className="relative w-full h-96 bg-gray-50 flex items-center justify-center">
      {/* SVG simplifié du circuit */}
      <svg width="100%" height="100%" viewBox="0 0 800 400">
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Composants (rectangles simplifiés) */}
        {components.map((comp, idx) => {
          const x = 100 + (idx % 4) * 150;
          const y = 100 + Math.floor(idx / 4) * 100;
          
          return (
            <g key={idx}>
              <rect
                x={x}
                y={y}
                width="100"
                height="60"
                fill="#3b82f6"
                stroke="#1e40af"
                strokeWidth="2"
                rx="8"
              />
              <text
                x={x + 50}
                y={y + 35}
                textAnchor="middle"
                fill="white"
                fontSize="12"
                fontWeight="600"
              >
                {comp.component?.substring(0, 10) || `Part ${idx}`}
              </text>
            </g>
          );
        })}

        {/* Connexions (lignes) */}
        {connections.map((conn, idx) => {
          const fromX = 100 + (conn.from % 4) * 150 + 100;
          const fromY = 100 + Math.floor(conn.from / 4) * 100 + 30;
          const toX = 100 + (conn.to % 4) * 150;
          const toY = 100 + Math.floor(conn.to / 4) * 100 + 30;

          return (
            <line
              key={idx}
              x1={fromX}
              y1={fromY}
              x2={toX}
              y2={toY}
              stroke={conn.color || '#10b981'}
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          );
        })}
      </svg>

      {/* Overlay "Click to simulate" */}
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 cursor-pointer">
        <div className="bg-white rounded-lg shadow-lg p-6 text-center">
          <Play className="w-12 h-12 text-purple-600 mx-auto mb-2" />
          <p className="text-gray-900 font-semibold mb-1">Prêt à simuler</p>
          <p className="text-sm text-gray-600">
            Cliquez "Simuler" pour démarrer
          </p>
        </div>
      </div>
    </div>
  );
}

// Hook pour utiliser le simulateur
export function useWokwiSimulator(code, components) {
  const [simulatorReady, setSimulatorReady] = useState(false);

  useEffect(() => {
    if (code && components?.length > 0) {
      setSimulatorReady(true);
    }
  }, [code, components]);

  return {
    simulatorReady,
    canSimulate: code && components?.length > 0
  };
}