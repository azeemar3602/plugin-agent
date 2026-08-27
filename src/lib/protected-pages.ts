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
  const max = 60;
  const next =
    slug.length + suffix.length <= max
      ? `${slug}${suffix}`
      : `${slug.slice(0, Math.max(1, max - suffix.length))}${suffix}`;
  return { id: undefined, slug: next || "design-convert", skippedProtected: true };
}
