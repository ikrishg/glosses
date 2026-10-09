import type { QlooEntity } from "@/lib/qloo/types";
import { QLOO_FOOD_INSIGHTS_TAG } from "@/lib/qloo/food-tags";

const INSIGHT_ENTITY_TAG = "qloo-insight";

function tagLooksLikeRestaurant(tag: string): boolean {
  return (
    tag === QLOO_FOOD_INSIGHTS_TAG ||
    /restaurant/i.test(tag) ||
    /urn:tag:.*:restaurant/i.test(tag)
  );
}

function tagLooksLikeNeighbourhood(tag: string): boolean {
  return /neighbourhood|neighborhood/i.test(tag);
}

function tagLooksLikeEvent(tag: string): boolean {
  return tag.includes("urn:entity:event") || /urn:tag:.*:event/i.test(tag);
}

/** Food stops for outings — restaurants only, not neighbourhoods or generic places. */
export function isRestaurantFood(entity: QlooEntity): boolean {
  if (entity.tags.some(tagLooksLikeNeighbourhood)) {
    return false;
  }
  if (entity.tags.some(tagLooksLikeRestaurant)) {
    return true;
  }
  if (entity.domain === "food" && !entity.tags.includes(INSIGHT_ENTITY_TAG)) {
    return true;
  }
  return false;
}

/** Post-meal activity — venues and events, not bands/film/TV/book picks. */
export function isOutingActivity(entity: QlooEntity): boolean {
  if (entity.domain === "places") {
    return true;
  }
  if (
    entity.domain === "music" ||
    entity.domain === "film" ||
    entity.domain === "tv" ||
    entity.domain === "books"
  ) {
    return false;
  }
  return entity.tags.some(tagLooksLikeEvent);
}
