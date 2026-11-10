// For the words checks (words.test.ts, family-words.test.ts); not exported from the package.

/** The text inside every string and template in `source`, with `${…}` and comments left out. */
export function stringsOf(source: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = source.length;
  const code = (stopAtBrace: boolean): void => {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      if (c === "/" && source[i + 1] === "/") {
        while (i < n && source[i] !== "\n") i++;
      } else if (c === "/" && source[i + 1] === "*") {
        i = source.indexOf("*/", i + 2);
        i = i < 0 ? n : i + 2;
      } else if (c === '"' || c === "'") {
        let s = "";
        i++;
        while (i < n && source[i] !== c) {
          if (source[i] === "\\") i++;
          s += source[i];
          i++;
        }
        i++;
        out.push(s);
      } else if (c === "`") {
        i++;
        let s = "";
        while (i < n && source[i] !== "`") {
          if (source[i] === "\\") {
            s += source[i + 1];
            i += 2;
          } else if (source[i] === "$" && source[i + 1] === "{") {
            i += 2;
            out.push(s);
            s = "";
            code(true);
          } else {
            s += source[i];
            i++;
          }
        }
        i++;
        out.push(s);
      } else if (c === "{") {
        depth++;
        i++;
      } else if (c === "}") {
        i++;
        if (stopAtBrace && depth === 0) return;
        depth--;
      } else {
        i++;
      }
    }
  };
  code(false);
  return out.filter((s) => s.trim() !== "");
}
