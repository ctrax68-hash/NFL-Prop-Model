import { describe, expect, it } from "vitest";

import { normaliseName } from "./text";

describe("normaliseName", () => {
  it("lowercases and strips punctuation/spacing", () => {
    expect(normaliseName("Ja'Marr Chase")).toBe("jamarrchase");
  });

  it("strips a Jr/Sr/II/III/IV/V suffix as its own word", () => {
    expect(normaliseName("James Cook III")).toBe("jamescook");
    expect(normaliseName("Odell Beckham Jr.")).toBe("odellbeckham");
    expect(normaliseName("Michael Pittman Sr.")).toBe("michaelpittman");
    expect(normaliseName("Robert Griffin II")).toBe("robertgriffin");
    expect(normaliseName("Henry Ruggs IV")).toBe("henryruggs");
  });

  it("matches the same person's name with and without a suffix", () => {
    expect(normaliseName("James Cook")).toBe(normaliseName("James Cook III"));
  });

  it("does not strip letters that merely spell a suffix mid-name", () => {
    // "Vi" isn't a trailing suffix word here, so the boundary check must not
    // eat it out of the middle of a real name.
    expect(normaliseName("Vito Rivera")).toBe("vitorivera");
  });

  it("normalises accented characters to their plain-letter equivalent", () => {
    expect(normaliseName("Déjà Vu")).toBe("dejavu");
  });
});
