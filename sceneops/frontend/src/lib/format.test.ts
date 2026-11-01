import { describe, expect, it } from "vitest";
import { fmtBytes, fmtDevice, fmtDuration, shortHash, fmtDateTime } from "./format";

describe("format", () => {
  it("formats device time as recorded without timezone conversion", () => {
    expect(fmtDevice("2025-01-25T22:14:36")).toBe("25/01/2025 22:14:36");
    expect(fmtDevice(null)).toBe("—");
  });
  it("converts UTC system time to Israel time", () => {
    // 20:00 UTC בינואר = 22:00 שעון ישראל (חורף)
    expect(fmtDateTime("2025-01-25T20:00:00Z")).toContain("22:00");
  });
  it("formats sizes and durations", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtDuration(65)).toBe("01:05");
    expect(fmtDuration(3725)).toBe("01:02:05");
  });
  it("shortens hashes", () => {
    const h = "a".repeat(64);
    expect(shortHash(h, 8)).toBe("aaaaaaaa…aaaaaa");
    expect(shortHash(null)).toBe("—");
  });
});
