import { describe, expect, it } from "vitest";
import { scoreEvidenceSignals } from "@/lib/evidence-intelligence";

describe("evidence intelligence signals", () => {
  it("rewards capture time, location, device, and adequate payload size", () => {
    const result = scoreEvidenceSignals({
      contentType: "image/jpeg",
      capturedAt: "2026-01-01T00:00:00.000Z",
      latitude: 40.7128,
      longitude: -74.006,
      device: "Certifera Camera",
      byteSize: 2_048,
    });
    expect(result.score).toBe(100);
    expect(result.flags).toEqual(["file_signature_validated"]);
  });

  it("flags missing contextual metadata instead of inferring truth", () => {
    const result = scoreEvidenceSignals({ contentType: "application/pdf", byteSize: 512 });
    expect(result.score).toBeLessThan(70);
    expect(result.flags).toContain("capture_time_unavailable");
    expect(result.flags).toContain("gps_unavailable");
    expect(result.flags).toContain("document_metadata_limited");
  });
});
