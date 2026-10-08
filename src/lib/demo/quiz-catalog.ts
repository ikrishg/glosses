import type { QlooDomain } from "@/lib/qloo/types";
import { entitiesByDomain } from "@/lib/graph/fixture-graph";

export interface QuizPrompt {
  id: string;
  domain: QlooDomain;
  question: string;
  entityId: string;
  label: string;
}

/** Filmable taste quiz — picks map 1:1 to fixture entity IDs for the graph engine. */
export function buildTasteQuiz(): QuizPrompt[] {
  const domains: QlooDomain[] = [
    "music",
    "film",
    "books",
    "places",
    "food",
    "tv",
  ];
  const prompts: QuizPrompt[] = [];
  for (const domain of domains) {
    const options = entitiesByDomain(domain);
    for (const entity of options.slice(0, 2)) {
      prompts.push({
        id: `quiz:${entity.id}`,
        domain,
        question: `You reach for something in ${domain}…`,
        entityId: entity.id,
        label: entity.name,
      });
    }
  }
  return prompts;
}
