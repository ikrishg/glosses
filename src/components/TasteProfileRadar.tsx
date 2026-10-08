"use client";

import type { DomainWeights } from "@/lib/engine/profile";

const LABELS: { key: keyof DomainWeights; label: string }[] = [
  { key: "music", label: "Music" },
  { key: "film", label: "Film" },
  { key: "books", label: "Books" },
  { key: "places", label: "Places" },
  { key: "food", label: "Food" },
  { key: "tv", label: "TV" },
];

export function TasteProfileRadar({ weights }: { weights: DomainWeights }) {
  return (
    <div className="grid gap-3">
      {LABELS.map(({ key, label }) => (
        <div key={key}>
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>{label}</span>
            <span>{Math.round(weights[key] * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-500 ease-out"
              style={{ width: `${Math.max(4, weights[key] * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
