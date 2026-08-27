/**
 * WordPress stores post_name in a VARCHAR(200), so that is the real ceiling.
 * Anything shorter just truncates titles mid-word for no reason.
 */
export const MAX_SLUG_LENGTH = 200;

/** Live blog article on wp.azbuilds.xyz — never overwrite this page. */
export const PROTECTED_PAGE_IDS = new Set([23]);

export const PROTECTED_PAGE_SLUGS = new Set([
  "how-can-vets-reduce-no-shows-at-their-clinic-effectively",
]);

export function isProtectedElementorPage(id?: number, slug?: string): boolean {
  if (typeof id === "number" && PROTECTED_PAGE_IDS.has(id)) return true;
  if (slug && PROTECTED_PAGE_SLUGS.has(slug)) return true;
  return false;
}

/** If the slug/id is protected, publish a new page instead of updating page 23. */
export function resolvePublishTarget(
  existingId: number | undefined,
  slug: string,
): { id: number | undefined; slug: string; skippedProtected: boolean } {
  if (!isProtectedElementorPage(existingId, slug)) {
    return { id: existingId, slug, skippedProtected: false };
  }
  const suffix = "-convert";
  const max = MAX_SLUG_LENGTH;
  // Truncating can land on a separator, and WordPress collapses "foo--convert"
  // to "foo-convert" — so trim the stem or the slug we look up never matches.
  const stem =
    slug.length + suffix.length <= max
      ? slug
      : slug.slice(0, Math.max(1, max - suffix.length)).replace(/-+$/, "");
  const next = stem ? `${stem}${suffix}` : "design-convert";
  return { id: undefined, slug: next, skippedProtected: true };
}
