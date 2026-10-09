"use client";

import { useEffect, useState } from "react";
import { GlossesDemo } from "@/components/GlossesDemo";
import { buildSeedPeople } from "@/lib/demo/seed";
import type { QlooDataMode } from "@/lib/qloo/data-mode";
import type { QlooGraphSnapshot } from "@/lib/qloo/types";

type GraphPayload = {
  mode: QlooDataMode;
  graph: QlooGraphSnapshot;
};

export function GlossesApp() {
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/graph", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Graph API ${res.status}`);
        }
        return res.json() as Promise<GraphPayload>;
      })
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load graph");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-10 text-red-700">
        Could not load taste graph: {error}
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-600">
        Loading taste graph…
      </div>
    );
  }

  const seedPeople = buildSeedPeople(payload.graph);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <GlossesDemo
        mode={payload.mode}
        graph={payload.graph}
        seedPeople={seedPeople}
      />
    </div>
  );
}
