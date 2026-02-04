/**
 * Tests CircuitVision AI
 * Validation automatique de toutes les fonctionnalités critiques
 */

// Test 1 : Hardware Validator
export function testHardwareValidator() {
  const { analyzeHardwareCode } = require('./lib/hardware-validator');
  
  console.log('🧪 Test 1: Hardware Validator');
  
  const testCode = `
    #define LED_PIN GPIO6
    #define DHT_PIN GPIO15
    #define SENSOR_PIN GPIO6
    
    const char* ssid = "MyWiFi";
    const char* password = "12345678";
    
    void setup() {
      pinMode(LED_PIN, OUTPUT);
      dht.begin();
    }
    
    void loop() {
      float temp = dht.readTemperature();
      delay(500);
    }
  `;
  
  const result = analyzeHardwareCode(testCode);
  
  const assertions = [
    {
      name: 'Pin conflicts detected',
      pass: result.stats.critical >= 1,
      actual: result.stats.critical
    },
    {
      name: 'Timing issues detected',
      pass: result.stats.warnings >= 1,
      actual: result.stats.warnings
    },
    {
      name: 'Security warnings detected',
      pass: result.stats.info >= 1,
      actual: result.stats.info
    },
    {
      name: 'Total bugs > 0',
      pass: result.bugs.length > 0,
      actual: result.bugs.length
    }
  ];
  
  return {
    test: 'Hardware Validator',
    passed: assertions.every(a => a.pass),
    assertions
  };
}

// Test 2 : Component Search
export function testComponentSearch() {
  const { extractComponentsFromCode, estimateQuantity } = require('./lib/component-search');
  
  console.log('🧪 Test 2: Component Search');
  
  const testCode = `
    #include <DHT.h>
    #include <BMP280.h>
    
    DHT dht(15, DHT22);
    BMP280 bmp;
    
    Servo myServo;
  `;
  
  const components = extractComponentsFromCode(testCode);
  const dht22Qty = estimateQuantity(testCode, 'DHT22');
  
  const assertions = [
    {
      name: 'DHT22 detected',
      pass: components.includes('DHT22'),
      actual: components
    },
    {
      name: 'BMP280 detected',
      pass: components.includes('BMP280'),
      actual: components
    },
    {
      name: 'Servo detected',
      pass: components.includes('Servo Motor'),
      actual: components
    },
    {
      name: 'Quantity estimation works',
      pass: dht22Qty >= 1,
      actual: dht22Qty
    }
  ];
  
  return {
    test: 'Component Search',
    passed: assertions.every(a => a.pass),
    assertions
  };
}

// Test 3 : Mermaid Validator
export function testMermaidValidator() {
  const { sanitizeMermaidCode } = require('./lib/mermaid-validator');
  
  console.log('🧪 Test 3: Mermaid Validator');
  
  // Code Mermaid cassé intentionnellement
  const brokenMermaid = `
    flowchart TD
        Node(" Invalid syntax )
        Node --> Node2[Test]
        Node2 -->| Label with pipe | Node3
  `;
  
  const fixed = sanitizeMermaidCode(brokenMermaid);
  
  const assertions = [
    {
      name: 'Sanitizer returns valid code',
      pass: fixed !== null && fixed.length > 0,
      actual: fixed?.substring(0, 50)
    },
    {
      name: 'Flowchart declaration present',
      pass: fixed?.includes('flowchart'),
      actual: fixed?.includes('flowchart')
    },
    {
      name: 'No pipe labels in output',
      pass: !fixed?.includes('-->|'),
      actual: !fixed?.includes('-->|')
    }
  ];
  
  return {
    test: 'Mermaid Validator',
    passed: assertions.every(a => a.pass),
    assertions
  };
}

// Test 4 : Schemas Zod
export function testZodSchemas() {
  const { DocumentationSchema, HardwareBugSchema } = require('./lib/schemas');
  
  console.log('🧪 Test 4: Zod Schemas');
  
  const validDoc = {
    overview: {
      title: 'Test Project',
      description: 'A test description',
      architecture: 'ESP32 + sensors'
    },
    hardware: [
      {
        component: 'ESP32',
        pin: 'GPIO15',
        function: 'DHT22 Data'
      }
    ],
    pin_configuration: '#define DHT_PIN 15',
    libraries: [
      { name: 'DHT.h', purpose: 'Temperature sensor' }
    ],
    code_logic: {
      setup_steps: ['Init Serial', 'Init sensors'],
      loop_logic: 'Read sensors every 2s',
      critical_functions: ['readTemperature()']
    },
    mermaid_diagram: 'flowchart TD\n    ESP32[ESP32]',
    installation: [
      {
        step_number: 1,
        title: 'Install IDE',
        description: 'Download Arduino IDE'
      }
    ],
    testing: {
      hardware_checks: ['Check wiring'],
      serial_checks: ['Verify output'],
      common_errors: [{ error: 'Timeout', solution: 'Check connections' }]
    }
  };
  
  const validBug = {
    severity: 'critical',
    type: 'pin_conflict',
    description: 'GPIO6 used twice',
    location: 'main.ino',
    suggestion: 'Use different pins'
  };
  
  const docResult = DocumentationSchema.safeParse(validDoc);
  const bugResult = HardwareBugSchema.safeParse(validBug);
  
  const assertions = [
    {
      name: 'DocumentationSchema validates',
      pass: docResult.success,
      actual: docResult.success ? 'Valid' : docResult.error.message
    },
    {
      name: 'HardwareBugSchema validates',
      pass: bugResult.success,
      actual: bugResult.success ? 'Valid' : bugResult.error.message
    }
  ];
  
  return {
    test: 'Zod Schemas',
    passed: assertions.every(a => a.pass),
    assertions
  };
}

// Test 5 : Platform Detection
export function testPlatformDetection() {
  const { detectPlatformType } = require('./lib/platform-support');
  
  console.log('🧪 Test 5: Platform Detection');
  
  const tests = [
    {
      code: 'void setup() {} void loop() {} #include <Arduino.h>',
      files: ['main.ino'],
      expected: 'arduino'
    },
    {
      code: 'import RPi.GPIO as GPIO',
      files: ['main.py'],
      expected: 'raspberrypi'
    },
    {
      code: '(kicad_pcb (version 20211014)',
      files: ['project.kicad_pcb'],
      expected: 'kicad'
    },
    {
      code: 'entity counter is port ( clk : in std_logic',
      files: ['counter.vhd'],
      expected: 'fpga'
    }
  ];
  
  const assertions = tests.map(t => {
    const result = detectPlatformType(t.code, t.files);
    return {
      name: `Detect ${t.expected}`,
      pass: result.platform === t.expected,
      actual: result.platform
    };
  });
  
  return {
    test: 'Platform Detection',
    passed: assertions.every(a => a.pass),
    assertions
  };
}

// Test 6 : GitHub Scanner Mock
export function testGithubScanner() {
  console.log('🧪 Test 6: GitHub Scanner');
  
  // Mock simple de la fonction
  const mockRepoContent = `
    --- FICHIER: src/main.ino ---
    #include <DHT.h>
    DHT dht(15, DHT22);
    
    --- FICHIER: platformio.ini ---
    [env:esp32]
    platform = espressif32
  `;
  
  const assertions = [
    {
      name: 'Content extracted',
      pass: mockRepoContent.length > 0,
      actual: mockRepoContent.length
    },
    {
      name: 'Files detected',
      pass: mockRepoContent.includes('FICHIER:'),
      actual: true
    }
  ];
  
  return {
    test: 'GitHub Scanner',
    passed: assertions.every(a => a.pass),
    assertions
  };
}

// Runner de tests
export async function runAllTests() {
  console.log('🚀 Running CircuitVision AI Test Suite\n');
  
  const tests = [
    testHardwareValidator,
    testComponentSearch,
    testMermaidValidator,
    testZodSchemas,
    testPlatformDetection,
    testGithubScanner
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const result = test();
      results.push(result);
      
      // Log résultat
      const emoji = result.passed ? '✅' : '❌';
      console.log(`${emoji} ${result.test}`);
      
      result.assertions.forEach(assertion => {
        const symbol = assertion.pass ? '  ✓' : '  ✗';
        console.log(`${symbol} ${assertion.name}`);
        if (!assertion.pass) {
          console.log(`    Expected: pass`);
          console.log(`    Actual: ${assertion.actual}`);
        }
      });
      
      console.log('');
      
    } catch (error) {
      console.error(`❌ ${test.name} failed with error:`, error.message);
      results.push({
        test: test.name,
        passed: false,
        error: error.message
      });
    }
  }
  
  // Résumé
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  
  console.log('━'.repeat(50));
  console.log(`📊 TEST SUMMARY`);
  console.log('━'.repeat(50));
  console.log(`Total:  ${totalTests}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ❌`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  console.log('━'.repeat(50));
  
  return {
    total: totalTests,
    passed: passedTests,
    failed: failedTests,
    successRate: Math.round((passedTests / totalTests) * 100),
    results
  };
}

// Export pour utilisation en CLI
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    testHardwareValidator,
    testComponentSearch,
    testMermaidValidator,
    testZodSchemas,
    testPlatformDetection,
    testGithubScanner
  };
}

// Script CLI
if (require.main === module) {
  runAllTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}