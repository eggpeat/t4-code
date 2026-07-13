import { describe, expect, it } from "vite-plus/test";
import { buildHistory, buildHistoryParts } from "../src/engine.ts";
import { SCENARIO_IDS, hashSeed, loadAllScenarios } from "../src/seeds.ts";

const expected: Record<string, string> = {
  "basic-v1": "ce9abf80d0ec0311655c6f152707829d997a05c173d9779aba142132e992a81e",
  "stream-v1": "a637d5b75fd63d1d5067a70072a4e782b2744a2d55f7e027918c3b740f156b98",
  "hierarchy-v1": "8ac026ad4bf17f5bc295649ffe0d99c36b647f48a6ec6316ffa6bfcc5cd67f9c",
  "history-10k-v1": "839a64643922ecf2a3ee4e7ef8fe5a4d2c28591dbd0dfc038c5cc25b43f6bc7f",
  "faults-v1": "d9531d6afa57fa6ca9a713cdf0abc6ccf9764ee5a7ce899df3b4a1560037a737",
  "multi-client-v1": "3ccdae99e50e0878e1dc4efa17a5956e3f2425ad7db99c755d339a065e5cffab",
  "remote-v1": "31f4f1684229f8b1fa5b09cc0404b46070491a7a151ab5b7ce2253cb09ecb6a9",
  "a11y-v1": "de73e2b38c381f33e2100fbe57b79f548bf7c7d73dfc337da18918f4f907a83b",
  "reconnect-v1": "ed59a0a702fec2f57248590eeab58f22b86b7110cba8c80f38a51ce3f42e6083",
  "preview-v1": "d61a05861c72775e2e30fcda5bac06548f8b411dc7f3cac1268f5009b2034a27",
};
describe("frozen fixture seeds", () => {
  it("loads all fixed IDs with independently recorded hashes", () => {
    const seeds = loadAllScenarios();
    expect(seeds).toHaveLength(10);
    for (const seed of seeds) expect(hashSeed(seed)).toBe(expected[seed.id]);
  });
  it("generates exact history cardinalities algorithmically", () => {
    const seed = loadAllScenarios().find(value => value.id === "history-10k-v1")!;
    expect(buildHistory(seed)).toHaveLength(10_000);
    expect(buildHistoryParts(seed)).toHaveLength(30_000);
  });
  it("keeps scenario list stable", () => { expect(SCENARIO_IDS).toEqual(Object.keys(expected)); });
});
