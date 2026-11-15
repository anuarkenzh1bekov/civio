/**
 * The model is asked to cite one passage per marker, [S1][S2], but sometimes groups them as
 * [S2, S5]. The renderer only turns single markers into source links, so split the groups.
 */
export function splitGroupedCitations(text: string): string {
  return text.replace(/\[(S\d+(?:\s*[,;]\s*S\d+)+)\]/g, (_match, group: string) =>
    group
      .split(/\s*[,;]\s*/)
      .map((id) => `[${id}]`)
      .join(""),
  );
}
