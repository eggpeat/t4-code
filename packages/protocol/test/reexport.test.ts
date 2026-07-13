import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import {
  PROTOCOL_VERSION,
  decodeClientFrame,
  decodeServerFrame,
  type AppFrame,
} from "../src/index.ts";

const appWireEntry = fileURLToPath(import.meta.resolve("@oh-my-pi/app-wire"));
const appWireRoot = dirname(dirname(appWireEntry));

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(appWireRoot, "fixtures", "v1", name), "utf8")) as unknown;
}

function decodeServerFixture(name: string): AppFrame {
  return decodeServerFrame(fixture(name));
}

describe("@omp/protocol app-wire facade", () => {
  it("re-exports the frozen protocol version and decoders", () => {
    expect(PROTOCOL_VERSION).toBe("omp-app/1");
    expect(decodeClientFrame(fixture("hello.json"))).toMatchObject({ type: "hello", v: "omp-app/1" });
  });

  it("decodes canonical server fixtures through the facade", () => {
    expect(decodeServerFixture("snapshot.json")).toMatchObject({ type: "snapshot", cursor: { epoch: "epoch-2", seq: 9 } });
    expect(decodeServerFixture("event.json")).toMatchObject({ type: "event", cursor: { epoch: "epoch-2", seq: 11 } });
    expect(decodeServerFixture("response.json")).toMatchObject({ type: "response", requestId: "req-1", ok: true });
    expect(decodeServerFixture("gap.json")).toMatchObject({ type: "gap", from: { epoch: "epoch-2", seq: 12 } });
    expect(decodeServerFixture("error.json")).toMatchObject({ type: "error", code: "NOT_AUTHORIZED" });
  });
});
