import * as exifr from "exifr";

export type EvidenceIntelligence = {
  score: number;
  flags: string[];
  metadata: Record<string, string | number | boolean | null>;
};

function toIso(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
  return null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : null;
}

function coordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10_000) / 10_000 : null;
}

export function scoreEvidenceSignals(input: { contentType: string; capturedAt?: string | null; latitude?: number | null; longitude?: number | null; device?: string | null; byteSize: number }) {
  const flags = ["file_signature_validated"];
  let score = 55;
  if (input.byteSize >= 1024) score += 5;
  else flags.push("small_file_requires_review");
  if (input.capturedAt) score += 15;
  else flags.push("capture_time_unavailable");
  if (input.latitude !== null && input.latitude !== undefined && input.longitude !== null && input.longitude !== undefined) score += 15;
  else flags.push("gps_unavailable");
  if (input.device) score += 10;
  else flags.push("device_metadata_unavailable");
  if (input.contentType === "application/pdf") flags.push("document_metadata_limited");
  return { score: Math.min(100, score), flags };
}

export async function analyzeEvidence(bytes: Buffer, contentType: string): Promise<EvidenceIntelligence> {
  let raw: Record<string, unknown> | undefined;
  if (contentType.startsWith("image/")) {
    try {
      raw = (await exifr.parse(bytes)) as Record<string, unknown> | undefined;
    } catch {
      raw = undefined;
    }
  }
  const capturedAt = toIso(raw?.DateTimeOriginal ?? raw?.CreateDate ?? raw?.ModifyDate);
  const latitude = coordinate(raw?.latitude);
  const longitude = coordinate(raw?.longitude);
  const make = text(raw?.Make);
  const model = text(raw?.Model);
  const device = [make, model].filter(Boolean).join(" ") || null;
  const scored = scoreEvidenceSignals({ contentType, capturedAt, latitude, longitude, device, byteSize: bytes.byteLength });
  return {
    score: scored.score,
    flags: scored.flags,
    metadata: {
      capturedAt,
      latitude,
      longitude,
      device,
      hasExif: Boolean(raw),
      contentType,
    },
  };
}
