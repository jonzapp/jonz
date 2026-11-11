import { wordsFor } from "@app/core";
import { describe, expect, it } from "vitest";

import { refused, wordsOf } from "@/lib/respond";

// A sentence the API writes is in the caller's language: the app sends it as Accept-Language.
describe("the caller's words", () => {
  const asked = (language?: string) => new Request("https://api.jonz.app/api/fresh", { headers: language ? { "accept-language": language } : {} });

  it("reads the language the app sends", () => {
    expect(wordsOf(asked("en-XA")).language).toBe("en-XA");
    expect(wordsOf(asked("en-XA,en;q=0.8")).language).toBe("en-XA");
  });

  it("reads English for a language Jonz hasn't got, or none", () => {
    expect(wordsOf(asked("fr-FR")).language).toBe("en");
    expect(wordsOf(asked()).language).toBe("en");
  });

  it("refuses in it", async () => {
    const answer = refused(asked("en-XA"), { code: "P0001", message: "vote_closed" });
    expect(await answer.json()).toEqual({ error: wordsFor("en-XA", "housemates")("errors.vote_closed") });
  });
});
