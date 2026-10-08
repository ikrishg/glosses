"use client";

import { useCallback, useMemo, useState } from "react";
import { FIXTURE_GRAPH, entityById } from "@/lib/graph/fixture-graph";
import { addTaste, domainWeights } from "@/lib/engine/profile";
import { recommendNextThing } from "@/lib/engine/recommend";
import { rankPeopleByTaste } from "@/lib/engine/match";
import { blendProfiles, blendedAsProfile } from "@/lib/engine/blend";
import { suggestSharedOuting } from "@/lib/engine/outing";
import {
  createEmptyDemoUser,
  HOBBIT_TAGLINE,
  SEED_PEOPLE,
} from "@/lib/demo/seed";
import { buildTasteQuiz } from "@/lib/demo/quiz-catalog";
import { TasteProfileRadar } from "@/components/TasteProfileRadar";
import type { UserTasteProfile } from "@/lib/qloo/types";

const quiz = buildTasteQuiz();

export function GlossesDemo() {
  const [profile, setProfile] = useState<UserTasteProfile>(() =>
    createEmptyDemoUser(),
  );
  const [selectedFriendId, setSelectedFriendId] = useState(
    SEED_PEOPLE[0].personId,
  );

  const logTaste = useCallback((entityId: string) => {
    setProfile((p) => addTaste(p, entityId));
  }, []);

  const weights = useMemo(() => domainWeights(profile), [profile]);
  const recommendations = useMemo(
    () => recommendNextThing(profile, FIXTURE_GRAPH, 4),
    [profile],
  );
  const ranked = useMemo(
    () => rankPeopleByTaste(profile, SEED_PEOPLE),
    [profile],
  );
  const selected = SEED_PEOPLE.find((p) => p.personId === selectedFriendId)!;
  const blend = useMemo(
    () => blendProfiles([profile, selected.profile]),
    [profile, selected],
  );
  const blendProfile = useMemo(
    () => blendedAsProfile(blend, `You + ${selected.displayName}`),
    [blend, selected],
  );
  const blendRecs = useMemo(
    () => recommendNextThing(blendProfile, FIXTURE_GRAPH, 3),
    [blendProfile],
  );
  const outing = useMemo(
    () => suggestSharedOuting(profile, selected.profile, FIXTURE_GRAPH),
    [profile, selected],
  );

  const loggedNames = profile.tastes
    .map((t) => entityById(t.entityId)?.name)
    .filter(Boolean);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-widest text-violet-600">
          Glosses · Oct 30 demo
        </p>
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
            Shifts visibly as you log — domain weights from fixture graph.
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
          From Qloo affinity traversal ({FIXTURE_GRAPH.version}) — not a chat
          completion.
        </p>
        {recommendations.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600">
            Log at least one taste to unlock recommendations.
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
                <span className="font-medium">{outing.place.name}</span> +{" "}
                <span className="font-medium">{outing.food.name}</span>
                {outing.activity && (
                  <>
                    {" "}
                    · then{" "}
                    <span className="font-medium">{outing.activity.name}</span>
                  </>
                )}
              </p>
              <p className="text-zinc-600">{outing.rationale}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Log taste to generate an outing plan.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
