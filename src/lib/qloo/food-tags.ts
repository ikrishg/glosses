/**
 * Restaurant tag for insights over `urn:entity:place` (Qloo `/v2/tags`, genre place).
 * Override with `QLOO_FOOD_INSIGHTS_TAG` when the hackathon catalog differs.
 */
export const QLOO_FOOD_INSIGHTS_TAG =
  process.env.QLOO_FOOD_INSIGHTS_TAG?.trim() ||
  "urn:tag:genre:place:restaurant";
