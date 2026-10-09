import type { QlooDomain } from "@/lib/qloo/types";

/** Qloo `/search` `types` values per Glosses domain (hackathon API). */
export const QLOO_SEARCH_TYPE_BY_DOMAIN: Record<QlooDomain, string> = {
  music: "urn:entity:artist",
  film: "urn:entity:movie",
  books: "urn:entity:book",
  tv: "urn:entity:tv_show",
  places: "urn:entity:place",
  food: "urn:entity:place",
};

export function qlooInsightsFilterType(domain: QlooDomain): string {
  return QLOO_SEARCH_TYPE_BY_DOMAIN[domain];
}
