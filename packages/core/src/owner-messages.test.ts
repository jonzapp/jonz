import { describe, expect, it } from "vitest";

import { messagePush, messageProblems, messageWays, sendLabel, sentMeta, sentWays, testWays, wayMeta } from "./owner-messages";
import { wordsFor } from "./words-for";

const words = wordsFor("en", "housemates");

const ALL = { push: true, wall: true, email: true };

describe("the ways a message goes", () => {
  it("never puts a message to one person, or a test, on a Wall", () => {
    expect(messageWays("person", ALL)).toEqual({ push: true, wall: false, email: true });
    expect(messageWays("test", ALL).wall).toBe(false);
    expect(messageWays("house", ALL).wall).toBe(true);
  });

  it("tests the ways it would go less the Wall, and a Wall-only message as a push", () => {
    expect(testWays(ALL)).toEqual({ push: true, wall: false, email: true });
    expect(testWays({ push: false, wall: true, email: false })).toEqual({ push: true, wall: false, email: false });
  });
});

describe("checking a draft", () => {
  const draft = { audience: "house" as const, personId: null, houseId: "h1", subject: "About the reset", body: "Fixed.", ways: ALL };

  it("is happy with a house, a subject, words and a way", () => {
    expect(messageProblems(draft, words)).toEqual({});
  });

  it("says who's missing, words too long, and no way to send it", () => {
    expect(Object.keys(messageProblems({ ...draft, houseId: null, subject: " ", body: "x".repeat(501), ways: { push: false, wall: false, email: false } }, words))).toEqual([
      "who",
      "subject",
      "body",
      "ways",
    ]);
    // A Wall alone can't reach one person.
    expect(messageProblems({ ...draft, audience: "person", personId: "u1", ways: { push: false, wall: true, email: false } }, words).ways).toBeDefined();
  });
});

describe("the words around it", () => {
  const reach = { people: 5, push: 4, email: 5, houses: 1 };

  it("names who the send button sends to", () => {
    expect(sendLabel("house", reach, "Elm Street")).toBe("Send to 5 people");
    expect(sendLabel("person", { ...reach, people: 1 }, "Ava")).toBe("Send to Ava");
    expect(sendLabel("everyone", { ...reach, people: 12_400 }, null)).toBe("Send to 12,400 people");
  });

  it("says how many have pushes on", () => {
    expect(wayMeta("push", "house", reach, words)).toBe("4 of 5 people have them on, silent in quiet hours");
    expect(wayMeta("push", "person", { ...reach, people: 1, push: 0 }, words)).toMatch(/won’t arrive/);
  });

  it("opens the Wall from the push when it went there too", () => {
    expect(messagePush({ subject: "Hi", body: "There", wall: true })).toEqual({ title: "Hi", body: "There", url: "/house/wall" });
    expect(messagePush({ subject: "Hi", body: "There", wall: false }).url).toBe("/");
  });

  it("describes a sent message in one line", () => {
    expect(sentWays({ push: true, wall: true, email: true })).toBe("Push, Wall and email");
    expect(sentMeta({ audience: "house", toName: "Elm Street", people: 5, waiting: 2, push: true, wall: false, email: false }, words)).toBe(
      "Elm Street, 5 people, Push, 2 still sending",
    );
    expect(sentWays({ push: false, wall: true, email: true })).toBe("Wall and email");
    expect(sentMeta({ audience: "test", toName: null, people: 1, waiting: 0, push: true, wall: false, email: true }, words)).toBe("You, a test, Push and email");
  });
});
