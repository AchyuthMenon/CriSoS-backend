const assert = require("assert");
const { validateSosDto } = require("../server");

console.log("Running CriSOS Backend Validation Tests...");

// Test 1: Valid SOS payload
const validSos = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  messageType: "SOS",
  senderDeviceId: "device_abc_123",
  emergencyCategory: "MEDICAL",
  description: "Severe injury, urgent medical help needed",
  assistanceTypes: ["FIRST_AID", "EVACUATION"],
  latitude: 12.9716,
  longitude: 77.5946,
  locationAccuracyMeters: 5.5,
  locationTimestamp: Date.now(),
  createdAt: Date.now(),
  expiresAt: Date.now() + 86400000,
  hopCount: 1,
  maxHopCount: 5,
  deliveryStatus: "QUEUED",
  direction: "OUTGOING",
};

const errors1 = validateSosDto(validSos);
assert.strictEqual(errors1.length, 0, `Expected 0 errors for valid payload, got: ${errors1}`);
console.log("✓ Test 1 Passed: Valid SOS payload accepted");

// Test 2: Missing SOS ID
const missingId = { ...validSos, id: "" };
const errors2 = validateSosDto(missingId);
assert(errors2.some(e => e.includes("id")), "Expected error about missing id");
console.log("✓ Test 2 Passed: Missing ID correctly rejected");

// Test 3: Missing senderDeviceId
const missingSender = { ...validSos, senderDeviceId: null };
const errors3 = validateSosDto(missingSender);
assert(errors3.some(e => e.includes("senderDeviceId")), "Expected error about senderDeviceId");
console.log("✓ Test 3 Passed: Missing senderDeviceId correctly rejected");

// Test 4: Missing emergencyCategory
const missingCategory = { ...validSos, emergencyCategory: "" };
const errors4 = validateSosDto(missingCategory);
assert(errors4.some(e => e.includes("emergencyCategory")), "Expected error about emergencyCategory");
console.log("✓ Test 4 Passed: Missing emergencyCategory correctly rejected");

// Test 5: Missing or invalid createdAt
const invalidCreatedAt = { ...validSos, createdAt: -1 };
const errors5 = validateSosDto(invalidCreatedAt);
assert(errors5.some(e => e.includes("createdAt")), "Expected error about createdAt");
console.log("✓ Test 5 Passed: Invalid createdAt correctly rejected");

console.log("All CriSOS Backend Unit Tests Passed Successfully!");
