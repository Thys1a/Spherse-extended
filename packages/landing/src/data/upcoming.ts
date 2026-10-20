import type { LucideIcon } from "lucide-react";
import { Users } from "lucide-react";

export interface UpcomingFeature {
  id: "roundtable";
  icon: LucideIcon;
  i18nKeyPrefix: string;
}

export const upcomingFeatures: UpcomingFeature[] = [
  {
    id: "roundtable",
    icon: Users,
    i18nKeyPrefix: "upcoming.roundtable",
  },
];
