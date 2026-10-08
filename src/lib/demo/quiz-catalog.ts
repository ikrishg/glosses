import type { QlooDomain, QlooGraphSnapshot } from "@/lib/qloo/types";
import { FIXTURE_GRAPH } from "@/lib/graph/fixture-graph";

export interface QuizPrompt {
  id: string;
  domain: QlooDomain;
  question: string;
  entityId: string;
  label: string;
}

/** Filmable taste quiz — picks map 1:1 to graph entity IDs for the engine. */
export function buildTasteQuiz(
  graph: QlooGraphSnapshot = FIXTURE_GRAPH,
): QuizPrompt[] {
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
    const options = graph.entities.filter((e) => e.domain === domain);
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
