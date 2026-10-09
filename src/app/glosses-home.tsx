import { connection } from "next/server";
import { GlossesDemo } from "@/components/GlossesDemo";
import { buildTasteQuiz } from "@/lib/demo/quiz-catalog";
import { buildSeedPeople } from "@/lib/demo/seed";
import { loadAppGraph } from "@/lib/qloo/app-graph";

export async function GlossesHome() {
  await connection();
  const { mode, graph } = await loadAppGraph();
  const quiz = buildTasteQuiz(graph);
  const seedPeople = buildSeedPeople(graph);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <GlossesDemo
        mode={mode}
        graph={graph}
        quiz={quiz}
        seedPeople={seedPeople}
      />
    </div>
  );
}
