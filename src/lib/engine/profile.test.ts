import { describe, expect, it } from "vitest";
import { mergeTasteSignals } from "@/lib/engine/profile";
import type { UserTasteProfile } from "@/lib/qloo/types";

function profile(
  userId: string,
  tastes: { entityId: string; weight: number }[],
): UserTasteProfile {
  return {
    userId,
    displayName: userId,
    tastes: tastes.map((t, i) => ({
      entityId: t.entityId,
      weight: t.weight,
      loggedAt: i,
    })),
  };
}

describe("mergeTasteSignals", () => {
  it("is order-independent for three profiles sharing an entity", () => {
    const a = profile("a", [{ entityId: "e1", weight: 1 }]);
    const b = profile("b", [{ entityId: "e1", weight: 0.5 }]);
    const c = profile("c", [{ entityId: "e1", weight: 0.5 }]);

    const forward = mergeTasteSignals([a, b, c]);
    const reverse = mergeTasteSignals([c, b, a]);

    expect(forward[0].weight).toBeCloseTo(2 / 3, 5);
    expect(reverse[0].weight).toBeCloseTo(forward[0].weight, 5);
  });
});
