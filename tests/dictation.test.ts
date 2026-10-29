import { describe, expect, it } from "vitest";
import { appendSpoken, tidySentence } from "../src/voice/dictation";

describe("voice dictation text", () => {
  it("tidies a spoken chunk into a sentence", () => {
    expect(tidySentence("  went to the gym with ali  ")).toBe("Went to the gym with ali.");
    expect(tidySentence("long day!")).toBe("Long day!");
    expect(tidySentence("   ")).toBe("");
  });

  it("starts a new paragraph for a new dictation and continues it after", () => {
    let j = "Typed this earlier.";
    j = appendSpoken(j, "spent twelve dollars at chipotle", true);
    j = appendSpoken(j, "then studied for two hours", false);
    expect(j).toBe("Typed this earlier.\n\nSpent twelve dollars at chipotle. Then studied for two hours.");
  });

  it("fills an empty journal without leading blank lines", () => {
    expect(appendSpoken("", "slept badly", true)).toBe("Slept badly.");
    expect(appendSpoken("\n\n", "slept badly", true)).toBe("Slept badly.");
  });
});
