// Original idea numbers are stable; excluded effects must never enter the catalog.
export const EXCLUDED_EFFECT_IDS = Object.freeze([
  20, 34, 39, 44, 45, 51, 56, 67, 68, 69, 72, 75, 76, 84, 86, 87, 88, 90, 94, 97,
]);
export const ACCEPTED_EFFECT_IDS = Object.freeze(
  Array.from({ length: 100 }, (_, index) => index + 1).filter((id) => !EXCLUDED_EFFECT_IDS.includes(id)),
);

// Acceptance budgets; allocation and effect selection belong to later tasks.
export const PRESENTATION_LIMITS = Object.freeze({
  streetSlots: 7,
  staticDecorations: 24,
  backgroundGroups: 1,
  backgroundBirds: 3,
  ambientParticles: 8,
  successRings: 1,
  additionalDrawCalls: 12,
  additionalGeometries: 16,
  additionalTextures: 4,
  compressedImageBytes: 1.5 * 1024 * 1024,
  decodedImageBytes: 16 * 1024 * 1024,
});
