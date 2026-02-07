# E2E Test Plan

## Test 1: Arduino Classic
URL: https://github.com/adafruit/DHT-sensor-library
Expected:
- ✅ Documentation 8 sections
- ✅ Mermaid diagram
- ✅ No critical bugs

## Test 2: ESP32 PlatformIO
URL: https://github.com/espressif/arduino-esp32/tree/master/libraries/WiFi
Expected:
- ✅ Platform detected: PlatformIO
- ✅ Components: ESP32, WiFi
- ✅ Shopping list

## Test 3: Buggy Circuit (intentional)
URL: [Create test repo with GPIO6 conflict]
Expected:
- ❌ 1 critical bug detected
- ✅ Suggestion provided

## Test 4: Streaming
Enable streaming toggle
Expected:
- ✅ Real-time text appears
- ✅ Bugs badge shows
- ✅ Shopping list preview

## Test 5: GitHub Push
After doc generation:
Expected:
- ✅ Button "Push to GitHub" visible
- ✅ CIRCUIT_DOCUMENTATION.md created
- ✅ Success notification