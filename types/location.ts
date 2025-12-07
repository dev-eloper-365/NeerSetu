export type LocationType = "state" | "district";

export interface DetectedLocation {
  type: "country" | "state" | "district";
  name: string;
  stateName?: string;
}
