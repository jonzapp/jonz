/** Lower case with the accents taken off, so "sao" finds São Paulo and "cote" Côte d'Ivoire. */
function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Whether a search finds `text`: each word typed must start a word of it,
 * so "new y" finds New York and "bin" finds "Bins out", and nothing typed
 * finds everything. The time zone search and the command box (Ctrl K)
 * search this way.
 */
export function finds(query: string, text: string): boolean {
  const asked = plain(query).split(/[\s,/_-]+/).filter(Boolean);
  if (asked.length === 0) return true;
  const said = plain(text).split(/[\s,/_'’()-]+/);
  return asked.every((word) => said.some((part) => part.startsWith(word)));
}
