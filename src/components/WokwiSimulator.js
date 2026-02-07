"use client";
import { useState, useEffect, useCallback } from 'react';
import { Play, Square, Zap, Code, Settings, ExternalLink, X, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Wokwi Circuit Simulator Integration - CORRECTED VERSION
 * - Collapsible UI with close button
 * - Persists across page refresh
 * - Proper multi-platform detection
 */

// Helper function to map components to Wokwi parts
function mapComponentsToWokwiParts(components) {
  const wokwiParts = [];
  
  const componentMap = {
    'ESP32': 'wokwi-esp32-devkit-v1',
    'ESP8266': 'wokwi-esp8266',
    'Arduino Uno': 'wokwi-arduino-uno',
    'Arduino Nano': 'wokwi-arduino-nano',
    'Arduino Mega': 'wokwi-arduino-mega',
    'Raspberry Pi Pico': 'wokwi-pi-pico',
    'DHT22': 'wokwi-dht22',
    'DHT11': 'wokwi-dht11',
    'LED': 'wokwi-led',
    'Button': 'wokwi-pushbutton',
    'Servo': 'wokwi-servo',
    'LCD 16x2': 'wokwi-lcd1602',
    'LCD': 'wokwi-lcd1602',
    'Resistor': 'wokwi-resistor',
    'Relay': 'wokwi-relay',
    'Buzzer': 'wokwi-buzzer',
    'Sensor': 'wokwi-dht22',
    'BMP280': 'wokwi-bmp280',
    'MPU6050': 'wokwi-mpu6050',
  };

  components.forEach((comp, idx) => {
    let wokwiType = null;
    const compName = comp.component?.toLowerCase() || '';
    
    // Find matching Wokwi type
    for (const [key, value] of Object.entries(componentMap)) {
      if (compName.includes(key.toLowerCase())) {
        wokwiType = value;
        break;
      }
    }

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
}

// Helper function to map connections
function mapToWokwiConnections(connections) {
  return connections.map(conn => [
    `part_${conn.from}:${conn.fromPin}`,
    `part_${conn.to}:${conn.toPin}`,
    conn.color || 'green',
    []
  ]);
}

/**
 * ✅ IMPROVED: Detect platform from code automatically
 */
function detectPlatformFromCode(code, components) {
  const codeStr = code?.toLowerCase() || '';
  
  // ESP32 detection
  if (codeStr.includes('esp32') || 
      codeStr.includes('#include <wifi.h>') ||
      codeStr.includes('esp_') ||
      components.some(c => c.component?.toLowerCase().includes('esp32'))) {
    return 'ESP32';
  }
  
  // ESP8266 detection
  if (codeStr.includes('esp8266') || 
      codeStr.includes('#include <esp8266') ||
      components.some(c => c.component?.toLowerCase().includes('esp8266'))) {
    return 'ESP8266';
  }
  
  // Arduino Mega detection
  if (codeStr.includes('mega') || codeStr.includes('atmega2560')) {
    return 'Arduino Mega';
  }
  
  // Arduino Nano detection
  if (codeStr.includes('nano') || codeStr.includes('atmega328p')) {
    return 'Arduino Nano';
  }
  
  // Raspberry Pi Pico detection
  if (codeStr.includes('pico') || codeStr.includes('rp2040')) {
    return 'Raspberry Pi Pico';
  }
  
  // Default: Arduino Uno
  return 'Arduino Uno';
}

export default function WokwiSimulator({ 
  code, 
  components = [],
  connections = [],
  onSimulationStart,
  onSimulationStop,
  chatId // ✅ NEW: For persistence
}) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [wokwiConfig, setWokwiConfig] = useState(null);
  const [wokwiUrl, setWokwiUrl] = useState(null);
  const [error, setError] = useState(null);
  const [detectedPlatform, setDetectedPlatform] = useState('Arduino Uno');

  // ✅ NEW: Persist simulator state in localStorage
  useEffect(() => {
    if (chatId && typeof window !== 'undefined') {
      const savedState = localStorage.getItem(`simulator_${chatId}`);
      if (savedState) {
        try {
          const { collapsed } = JSON.parse(savedState);
          setIsCollapsed(collapsed || false);
        } catch (e) {
          console.error('Failed to load simulator state:', e);
        }
      }
    }
  }, [chatId]);

  // ✅ NEW: Save state when collapsed changes
  useEffect(() => {
    if (chatId && typeof window !== 'undefined') {
      localStorage.setItem(`simulator_${chatId}`, JSON.stringify({
        collapsed: isCollapsed
      }));
    }
  }, [isCollapsed, chatId]);

  // ✅ IMPROVED: Auto-detect platform from code
  useEffect(() => {
    if (code && components) {
      const platform = detectPlatformFromCode(code, components);
      setDetectedPlatform(platform);
      console.log('🎯 Platform detected:', platform);
    }
  }, [code, components]);

  // Generate Wokwi configuration
  const generateWokwiConfig = useCallback(() => {
    if (!code || !code.trim()) {
      setError("No Arduino code available for simulation");
      return;
    }

    const config = {
      version: 1,
      author: "CircuitVision AI",
      editor: "wokwi",
      parts: mapComponentsToWokwiParts(components),
      connections: mapToWokwiConnections(connections)
    };

    setWokwiConfig(config);

    // Generate proper Wokwi URL for simulation
    const encodedCode = encodeURIComponent(code);
    const projectUrl = `https://wokwi.com/arduino/new?code=${encodedCode}`;
    setWokwiUrl(projectUrl);
  }, [code, components, connections]);

  // Generate config when code or components change
  useEffect(() => {
    generateWokwiConfig();
  }, [generateWokwiConfig]);

  // Start simulation
  const handleStartSimulation = () => {
    setIsSimulating(true);
    onSimulationStart?.();
  };

  // Stop simulation
  const handleStopSimulation = () => {
    setIsSimulating(false);
    onSimulationStop?.();
  };

  // Open in Wokwi (new tab)
  const handleOpenInWokwi = () => {
    if (wokwiUrl) {
      window.open(wokwiUrl, '_blank');
    } else if (wokwiConfig) {
      const blob = new Blob([JSON.stringify(wokwiConfig, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wokwi-diagram.json';
      a.click();
    }
  };

  // ✅ NEW: Close/Remove simulator
  const handleClose = () => {
    setIsCollapsed(true);
  };

  if (!code || components.length === 0) {
    return null; // Don't render if no data
  }

  // ✅ NEW: Collapsed state
  if (isCollapsed) {
    return (
      <div className="border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm p-3">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setIsCollapsed(false)}
            className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-purple-400" />
              <span className="text-white font-medium">Circuit Simulator ({detectedPlatform})</span>
              <span className="text-xs text-gray-400">{components.length} components</span>
            </div>
            <ChevronUp className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* ✅ NEW: Header with collapse/close buttons */}
        <div className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                Circuit Simulator - {detectedPlatform}
              </h3>
              <p className="text-sm text-gray-600">
                Powered by Wokwi • {components.length} components
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
                Simulate
              </button>
            )}

            <button
              onClick={handleOpenInWokwi}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Wokwi
            </button>

            {/* ✅ NEW: Collapse button */}
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Minimize"
            >
              <ChevronDown className="w-5 h-5" />
            </button>

            {/* ✅ NEW: Close button */}
            <button
              onClick={handleClose}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close simulator"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Circuit preview / simulator */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {isSimulating && wokwiUrl ? (
            <div className="relative" style={{ paddingBottom: '56.25%', height: 0 }}>
              <iframe
                src={wokwiUrl}
                className="absolute top-0 left-0 w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Wokwi Circuit Simulator"
              />
            </div>
          ) : (
            <CircuitPreview 
              components={components} 
              connections={connections}
              config={wokwiConfig}
              platform={detectedPlatform}
              onSimulate={handleStartSimulation}
            />
          )}
        </div>

        {/* Circuit information */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-600 mb-1">Components</p>
            <p className="text-2xl font-bold text-gray-900">{components.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-600 mb-1">Connections</p>
            <p className="text-2xl font-bold text-gray-900">{connections.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-600 mb-1">Platform</p>
            <p className="text-lg font-bold text-purple-600">
              {detectedPlatform}
            </p>
          </div>
        </div>

        {/* Code preview */}
        <div className="bg-gray-900 rounded-lg p-4 overflow-hidden">
          <p className="text-sm text-gray-400 mb-2 flex items-center gap-2">
            <Code className="w-4 h-4" />
            Arduino Code Preview
          </p>
          <pre className="text-xs text-green-400 overflow-auto max-h-40 whitespace-pre-wrap">
            {code?.substring(0, 1000)}
            {code?.length > 1000 && '...'}
          </pre>
        </div>

        {/* Note */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <p className="text-sm text-blue-900">
            <strong>💡 Tip:</strong> Click "Simulate" to test your circuit in Wokwi. 
            LEDs blink, sensors react in real-time! Platform auto-detected: <strong>{detectedPlatform}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}

// Static circuit preview component
function CircuitPreview({ components, connections, config, platform, onSimulate }) {
  return (
    <div className="relative w-full h-96 bg-gray-50 flex items-center justify-center">
      {/* SVG simplified circuit */}
      <svg width="100%" height="100%" viewBox="0 0 800 400">
        {/* Background grid */}
        <defs>
          <pattern id="wokwi-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wokwi-grid)" />

        {/* Platform badge */}
        <text x="400" y="30" textAnchor="middle" fill="#6b7280" fontSize="14" fontWeight="600">
          {platform || 'Arduino Uno'}
        </text>

        {/* Components (simplified rectangles) */}
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

        {/* Connections (lines) */}
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

      {/* Overlay Click to simulate */}
      <button
        onClick={onSimulate}
        className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 cursor-pointer"
      >
        <div className="bg-white rounded-lg shadow-lg p-6 text-center">
          <Play className="w-12 h-12 text-purple-600 mx-auto mb-2" />
          <p className="text-gray-900 font-semibold mb-1">Ready to simulate</p>
          <p className="text-sm text-gray-600">
            Click "Simulate" to start
          </p>
        </div>
      </button>
    </div>
  );
}

// Hook for using the simulator
export function useWokwiSimulator(code, components) {
  const simulatorReady = code && components?.length > 0;
  const canSimulate = code && components?.length > 0;

  return {
    simulatorReady,
    canSimulate
  };
}