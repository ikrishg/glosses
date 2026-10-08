import type { BlendedTasteProfile, UserTasteProfile } from "@/lib/qloo/types";
import { mergeTasteSignals } from "@/lib/engine/profile";

export function blendProfiles(
  profiles: UserTasteProfile[],
): BlendedTasteProfile {
  return {
    participantIds: profiles.map((p) => p.userId),
    tastes: mergeTasteSignals(profiles),
  };
}

export function blendedAsProfile(
  blended: BlendedTasteProfile,
  displayName = "Blend",
): UserTasteProfile {
  return {
    userId: `blend:${blended.participantIds.join("+")}`,
    displayName,
    tastes: blended.tastes,
  };
}
