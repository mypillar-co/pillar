export type HeroVisualType = "banner_background" | "feature_photo" | "none";

export function normalizeHeroVisualType(
  value: unknown,
  legacyLayout?: unknown,
): HeroVisualType {
  if (
    value === "banner_background" ||
    value === "feature_photo" ||
    value === "none"
  ) {
    return value;
  }

  if (legacyLayout === "full_bleed" || legacyLayout === "background") {
    return "banner_background";
  }

  if (legacyLayout === "split_framed" || legacyLayout === "split") {
    return "feature_photo";
  }

  return "none";
}
