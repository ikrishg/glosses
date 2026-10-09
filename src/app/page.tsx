import { Suspense } from "react";
import { GlossesHome } from "@/app/glosses-home";

/** Allow request-time rendering for live graph / mode (not a static prerender shell). */
export const instant = false;

function GlossesLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-600">
      Loading taste graph…
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<GlossesLoading />}>
      <GlossesHome />
    </Suspense>
  );
}
