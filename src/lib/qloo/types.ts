export type QlooDomain =
  | "music"
  | "film"
  | "books"
  | "places"
  | "food"
  | "tv";

export interface QlooEntity {
  id: string;
  name: string;
  domain: QlooDomain;
  /** Taste tags used for overlap scoring (not shown to users as the recommendation reason). */
  tags: string[];
}

export interface QlooAffinityEdge {
  fromId: string;
  toId: string;
  /** Cross-domain link strength from Qloo-style graph (0–1). */
  weight: number;
}

export interface QlooGraphSnapshot {
  version: string;
  entities: QlooEntity[];
  edges: QlooAffinityEdge[];
}

export interface TasteSignal {
  entityId: string;
  /** 1 = strong like; decays as user adds more tastes. */
  weight: number;
  loggedAt: number;
}

export interface UserTasteProfile {
  userId: string;
  displayName: string;
  tastes: TasteSignal[];
}

export interface CrossDomainRecommendation {
  entity: QlooEntity;
  score: number;
  /** Domains the suggestion bridges from the user's logged tastes. */
  sourceDomains: QlooDomain[];
  rationale: string;
}

export interface TasteMatchResult {
  personId: string;
  displayName: string;
  tier: "friend" | "second_network" | "stranger";
  score: number;
  sharedEntityIds: string[];
}

export interface BlendedTasteProfile {
  participantIds: string[];
  tastes: TasteSignal[];
}

export interface SharedOutingSuggestion {
  place: QlooEntity;
  food: QlooEntity;
  activity?: QlooEntity;
  score: number;
  rationale: string;
}
