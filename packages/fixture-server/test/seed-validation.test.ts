import { describe, expect, it } from "vite-plus/test";
import { loadScenario, validateSeedSchema } from "../src/seeds.ts";

function base(): Record<string, unknown> {
  return structuredClone(loadScenario("basic-v1")) as unknown as Record<string, unknown>;
}

describe("fixture seed schema boundary parity", () => {
  const cases: Array<[string, (seed: Record<string, unknown>) => void]> = [
    [
      "unknown root property",
      (seed) => {
        seed.extra = true;
      },
    ],
    [
      "missing expectedHash",
      (seed) => {
        delete seed.expectedHash;
      },
    ],
    [
      "historyMessages below minimum",
      (seed) => {
        seed.historyMessages = -1;
      },
    ],
    [
      "historyMessages above maximum",
      (seed) => {
        seed.historyMessages = 10_001;
      },
    ],
    [
      "historyMessages non-integer",
      (seed) => {
        seed.historyMessages = 1.5;
      },
    ],
    [
      "historyParts above maximum",
      (seed) => {
        seed.historyParts = 30_001;
      },
    ],
    [
      "clients below minimum",
      (seed) => {
        seed.clients = 0;
      },
    ],
    [
      "clients above maximum",
      (seed) => {
        seed.clients = 9;
      },
    ],
    [
      "clients non-integer",
      (seed) => {
        seed.clients = "2";
      },
    ],
    [
      "accessibility wrong type",
      (seed) => {
        seed.accessibility = "true";
      },
    ],
    [
      "date wrong format",
      (seed) => {
        seed.baseTime = "2026-01-01";
      },
    ],
    [
      "date impossible day",
      (seed) => {
        seed.baseTime = "2026-02-30T00:00:00Z";
      },
    ],
    [
      "hash wrong length",
      (seed) => {
        seed.expectedHash = "a".repeat(63);
      },
    ],
    [
      "hash uppercase",
      (seed) => {
        seed.expectedHash = "A".repeat(64);
      },
    ],
    [
      "script unknown property",
      (seed) => {
        (seed.scripts as Record<string, unknown>).extra = true;
      },
    ],
    [
      "script atMs above maximum",
      (seed) => {
        (seed.scripts as Record<string, unknown>).prompt = [{ atMs: 3_600_001, kind: "event" }];
      },
    ],
    [
      "script atMs non-integer",
      (seed) => {
        (seed.scripts as Record<string, unknown>).prompt = [{ atMs: 1.2, kind: "event" }];
      },
    ],
    [
      "fault unknown property",
      (seed) => {
        (seed.faults as Array<Record<string, unknown>>)[0] = {
          id: "x",
          frame: null,
          expectedError: "x",
          extra: true,
        };
      },
    ],
    [
      "fault missing frame",
      (seed) => {
        (seed.faults as Array<Record<string, unknown>>)[0] = { id: "x", expectedError: "x" };
      },
    ],
    [
      "fault id over maximum",
      (seed) => {
        (seed.faults as Array<Record<string, unknown>>)[0] = {
          id: "x".repeat(129),
          frame: null,
          expectedError: "x",
        };
      },
    ],
  ];
  it.each(cases)("rejects %s", (_name, mutate) => {
    const seed = base();
    mutate(seed);
    expect(() => validateSeedSchema(seed, "basic-v1")).toThrow();
  });
  it("accepts every frozen seed and preserves the expected hash contract", () => {
    for (const id of [
      "basic-v1",
      "stream-v1",
      "hierarchy-v1",
      "history-10k-v1",
      "faults-v1",
      "multi-client-v1",
      "remote-v1",
      "a11y-v1",
      "reconnect-v1",
      "preview-v1",
    ] as const)
      expect(() => validateSeedSchema(loadScenario(id), id)).not.toThrow();
  });
});
