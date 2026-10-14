// Client tier-mirror tests (must match farmgate-backend/distance.js).
// Run from client/mobile: node --test utils/__tests__/deliveryFee.test.ts
// (Node type-stripping runs the .ts sources directly — no build step.)
import test from "node:test";
import assert from "node:assert/strict";

import {
  feeForAdjustedDistance,
  deliveryErrorMessage,
  formatKm,
  formatPeso,
  TIER_VERSION,
} from "../deliveryFee.ts";

test("mirror: 11 tiers incl. upper bounds (3.0 vs 3.1 boundary)", () => {
  assert.deepEqual(feeForAdjustedDistance(3.0), { fee: 25, tier: "0–3 km" });
  assert.deepEqual(feeForAdjustedDistance(3.1), { fee: 35, tier: "3.1–5 km" });
  assert.deepEqual(feeForAdjustedDistance(5.0), { fee: 35, tier: "3.1–5 km" });
  assert.deepEqual(feeForAdjustedDistance(5.1), { fee: 50, tier: "5.1–10 km" });
  assert.deepEqual(feeForAdjustedDistance(10.0), { fee: 50, tier: "5.1–10 km" });
  assert.deepEqual(feeForAdjustedDistance(10.1), { fee: 70, tier: "10.1–15 km" });
  assert.deepEqual(feeForAdjustedDistance(15.0), { fee: 70, tier: "10.1–15 km" });
  assert.deepEqual(feeForAdjustedDistance(15.1), { fee: 90, tier: "15.1–20 km" });
  assert.deepEqual(feeForAdjustedDistance(20.0), { fee: 90, tier: "15.1–20 km" });
  assert.deepEqual(feeForAdjustedDistance(20.1), { fee: 110, tier: "20.1–25 km" });
  assert.deepEqual(feeForAdjustedDistance(25.0), { fee: 110, tier: "20.1–25 km" });
  assert.deepEqual(feeForAdjustedDistance(25.1), { fee: 130, tier: "25.1–30 km" });
  assert.deepEqual(feeForAdjustedDistance(30.0), { fee: 130, tier: "25.1–30 km" });
  assert.deepEqual(feeForAdjustedDistance(30.1), { fee: 160, tier: "30.1–40 km" });
  assert.deepEqual(feeForAdjustedDistance(40.0), { fee: 160, tier: "30.1–40 km" });
  assert.deepEqual(feeForAdjustedDistance(40.1), { fee: 190, tier: "40.1–50 km" });
  assert.deepEqual(feeForAdjustedDistance(50.0), { fee: 190, tier: "40.1–50 km" });
  assert.deepEqual(feeForAdjustedDistance(50.1), { fee: 220, tier: "50.1–60 km" });
  assert.deepEqual(feeForAdjustedDistance(60.0), { fee: 220, tier: "50.1–60 km" });
  assert.deepEqual(feeForAdjustedDistance(60.1), { fee: 250, tier: "60.1–70 km" });
  assert.deepEqual(feeForAdjustedDistance(70.0), { fee: 250, tier: "60.1–70 km" });
  assert.equal(feeForAdjustedDistance(70.1), null);
  assert.equal(TIER_VERSION, "barangay-1.3-v2");
});

test("barangay error codes map to clear messages", () => {
  assert.ok(deliveryErrorMessage("FARM_MISSING_BARANGAY").toLowerCase().includes("barangay"));
  assert.ok(deliveryErrorMessage("UNKNOWN_CITY").toLowerCase().includes("city"));
  assert.ok(deliveryErrorMessage("UNKNOWN_BARANGAY").toLowerCase().includes("barangay"));
  assert.ok(deliveryErrorMessage("INVALID_PROVINCE").includes("Bulacan"));
});

test("formatKm/formatPeso peso formatting", () => {
  assert.equal(formatKm(2.5), "2.5 km");
  assert.equal(formatKm(null), "—");
  assert.equal(formatPeso(25), "₱25.00");
});
