"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { entityInGraph } from "@/lib/graph/lookup";
import { addTaste, domainWeights } from "@/lib/engine/profile";
import { recommendationEmptyReason } from "@/lib/engine/recommend";
import { createEmptyDemoUser, HOBBIT_TAGLINE } from "@/lib/demo/seed";
import type { RankablePerson } from "@/lib/engine/match";
import {
  buildTasteQuiz,
  type QuizPrompt,
} from "@/lib/demo/quiz-catalog";
import { TasteProfileRadar } from "@/components/TasteProfileRadar";
import type { QlooDataMode } from "@/lib/qloo/app-graph";
import { fetchQlooTool, useQlooTool } from "@/lib/qloo/use-qloo-tool";
import type {
  QlooDomain,
  QlooEntity,
  QlooGraphSnapshot,
  UserTasteProfile,
} from "@/lib/qloo/types";

const CATALOG_DOMAINS: QlooDomain[] = [
  "music",
  "film",
  "books",
  "places",
  "food",
  "tv",
];

export interface GlossesDemoProps {
  mode: QlooDataMode;
  graph: QlooGraphSnapshot;
  quiz: QuizPrompt[];
  seedPeople: RankablePerson[];
}

export function GlossesDemo({
  mode,
  graph,
  quiz: serverQuiz,
  seedPeople,
}: GlossesDemoProps) {
  const [profile, setProfile] = useState<UserTasteProfile>(() =>
    createEmptyDemoUser(),
  );
  const [selectedFriendId, setSelectedFriendId] = useState(
    seedPeople[0]?.personId ?? "",
  );

  const [catalog, setCatalog] = useState<QlooEntity[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      CATALOG_DOMAINS.map((domain) =>
        fetchQlooTool("search_entities", { domain, query: "" }),
      ),
    )
      .then((results) => {
        if (!cancelled) setCatalog(results.flatMap((r) => r.entities));
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, []);

  const quiz = useMemo(
    () =>
      catalog ? buildTasteQuiz({ ...graph, entities: catalog }) : serverQuiz,
    [catalog, graph, serverQuiz],
  );

  const logTaste = useCallback((entityId: string) => {
    setProfile((p) => addTaste(p, entityId));
  }, []);

  const weights = useMemo(
    () => domainWeights(profile, graph),
    [profile, graph],
  );
  const next = useQlooTool("recommend", { profile, limit: 4 });
  const recommendations = next?.recommendations ?? [];
  const emptyReason = useMemo(
    () => recommendationEmptyReason(profile, graph),
    [profile, graph],
  );
  const peopleArgs = useMemo(
    () =>
      seedPeople.map((p) => ({
        personId: p.personId,
        displayName: p.displayName,
        tier: p.tier,
        tastes: p.profile.tastes,
      })),
    [seedPeople],
  );
  const comparison = useQlooTool("compare_taste", {
    viewer: profile,
    people: peopleArgs,
    blendWithPersonId: selectedFriendId,
    blendLimit: 3,
  });
  const ranked = comparison?.matches ?? [];
  const selected =
    seedPeople.find((p) => p.personId === selectedFriendId) ?? seedPeople[0]!;
  const blendRecs = comparison?.blend.recommendations ?? [];
  const outing = comparison?.blend.outing ?? null;

  const loggedNames = profile.tastes
    .map((t) => entityInGraph(graph, t.entityId)?.name)
    .filter(Boolean);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium uppercase tracking-widest text-violet-600">
            Glosses · Oct 30 demo
          </p>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              mode === "live"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-zinc-200 text-zinc-700"
            }`}
          >
            Qloo {mode} · {graph.version}
          </span>
        </div>
        <h1 className="text-3xl font-semibold text-zinc-900">
          Taste graph → next thing → friends
        </h1>
        <p className="max-w-2xl text-zinc-600">{HOBBIT_TAGLINE}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Log taste (Qloo domains)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Tap picks — your profile bars update as you go.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {quiz.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => logTaste(q.entityId)}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm transition hover:border-violet-400 hover:bg-violet-50"
              >
                <span className="text-zinc-400">{q.domain}</span> · {q.label}
              </button>
            ))}
          </div>
          {loggedNames.length > 0 && (
            <p className="mt-4 text-sm text-zinc-600">
              Logged: {loggedNames.join(", ")}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Your taste profile</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Shifts visibly as you log — domain weights from the active graph.
          </p>
          <div className="mt-4">
            <TasteProfileRadar weights={weights} />
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-6">
        <h2 className="text-lg font-semibold text-violet-950">
          Cross-domain next thing
        </h2>
        <p className="mt-1 text-sm text-violet-800/80">
          From Qloo affinity traversal ({graph.version}) — not a chat
          completion.
          {next?.fixtureId && (
            <span data-testid="recommend-fixture-id"> Fixture {next.fixtureId}</span>
          )}
        </p>
        {recommendations.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">
            {emptyReason === "no_tastes"
              ? "Log at least one taste to unlock recommendations."
              : "Your picks are logged, but they have no cross-domain paths yet — try a music or film taste to branch out."}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recommendations.map((rec) => (
              <li
                key={rec.entity.id}
                className="rounded-xl bg-white p-4 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{rec.entity.name}</span>
                  <span className="text-xs uppercase text-zinc-400">
                    {rec.entity.domain}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{rec.rationale}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Friends & discovery</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Ranked: friends → second in network → strangers.
          {comparison?.fixtureId && (
            <span data-testid="compare-fixture-id"> Fixture {comparison.fixtureId}</span>
          )}
        </p>
        <ul className="mt-4 divide-y divide-zinc-100">
          {ranked.map((person) => (
            <li key={person.personId} className="flex items-center gap-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedFriendId(person.personId)}
                className={`flex-1 text-left rounded-lg px-2 py-1 ${
                  selectedFriendId === person.personId
                    ? "bg-violet-50 ring-1 ring-violet-200"
                    : "hover:bg-zinc-50"
                }`}
              >
                <div className="font-medium">{person.displayName}</div>
                <div className="text-xs text-zinc-500">
                  {person.tier.replace("_", " ")} · match{" "}
                  {Math.round(person.score * 100)}%
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Taste blend</h2>
          <p className="mt-1 text-sm text-zinc-500">
            With {selected.displayName}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {blendRecs.map((rec) => (
              <li key={rec.entity.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                {rec.entity.name}{" "}
                <span className="text-zinc-400">({rec.entity.domain})</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Suggested shared outing</h2>
          {outing ? (
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <span className="font-medium">{outing.place.name}</span> →{" "}
                <span className="font-medium">{outing.food.name}</span>
                {outing.activity && (
                  <>
                    {" "}
                    →{" "}
                    <span className="font-medium">{outing.activity.name}</span>
                  </>
                )}
              </p>
              <p className="text-zinc-600">{outing.rationale}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Log taste to generate an outing plan on the graph.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
