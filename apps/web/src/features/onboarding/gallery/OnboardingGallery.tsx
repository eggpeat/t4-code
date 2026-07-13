// Deterministic scene harness for the onboarding surfaces. Each scene mounts
// one surface with a named fixture; interactions run the real machines
// locally (like the panes fixture controller, it never pretends to be a
// runtime — service work stays visibly in flight, success only comes from
// fixture events the scene wires explicitly).
import { useState } from "react";

import {
  DEFAULT_PROJECT_CHOICES,
  DEVICE_FIXTURES,
  HOST_MENU_FIXTURE,
  ONBOARDING_EPOCH_MS,
  ONBOARDING_SCENARIOS,
  PAIRING_FIXTURES,
  PAIRING_REQUEST_FIXTURE,
  WIRE_PAIR_RESULT_FIXTURE,
} from "../fixtures.ts";
import type { OnboardingState } from "../flow.ts";
import { HostConnectionMenu } from "../HostConnectionMenu.tsx";
import { revokeDevice } from "../devices.ts";
import type { PairedDevice } from "../model.ts";
import { OnboardingFlow } from "../OnboardingFlow.tsx";
import {
  approveGrant,
  denyRequest,
  deviceRequested,
  issueCode,
  PAIRING_IDLE,
  type PairingPhase,
  toggleGrant,
} from "../pairing.ts";
import { PairedDeviceManager } from "../PairedDeviceManager.tsx";
import { PairingPanel } from "../PairingPanel.tsx";
import { serviceReduce } from "../service.ts";

export const GALLERY_SCENES = [
  "flow-runtime-checking",
  "flow-runtime-missing",
  "flow-runtime-failed",
  "flow-runtime-running",
  "flow-hosts",
  "flow-hosts-empty",
  "flow-defaults",
  "host-menu",
  "pairing-idle",
  "pairing-code",
  "pairing-review",
  "pairing-granted",
  "pairing-expired",
  "pairing-exhausted",
  "pairing-mismatch",
  "pairing-denied",
  "pairing-revoked",
  "devices",
  "devices-empty",
] as const;

export type GalleryScene = (typeof GALLERY_SCENES)[number];

const FLOW_SCENE_TO_SCENARIO: Readonly<Record<string, string>> = {
  "flow-runtime-checking": "runtime-checking",
  "flow-runtime-missing": "runtime-missing",
  "flow-runtime-failed": "runtime-failed",
  "flow-runtime-running": "runtime-running",
  "flow-hosts": "hosts",
  "flow-hosts-empty": "hosts-empty-remote-only",
  "flow-defaults": "defaults",
};

const PAIRING_SCENE_TO_FIXTURE: Readonly<Record<string, string>> = {
  "pairing-idle": "idle",
  "pairing-code": "code-issued",
  "pairing-review": "capability-review",
  "pairing-granted": "granted",
  "pairing-expired": "expired",
  "pairing-exhausted": "exhausted",
  "pairing-mismatch": "identity-mismatch",
  "pairing-denied": "capability-denied",
  "pairing-revoked": "revoked",
};

/** Deterministic pairing codes for interactive gallery runs. */
function nextFixtureCode(count: number): string {
  return `73${(9214 + count * 111) % 10_000}`.replace(/^(\d{3})(\d{3})$/, "$1 $2");
}

function FlowScene({ scenario }: { readonly scenario: OnboardingState }) {
  const [state, setState] = useState(scenario);
  const [pairing, setPairing] = useState<PairingPhase>(PAIRING_IDLE);
  const [codes, setCodes] = useState(0);
  const [done, setDone] = useState(false);
  const issue = () => {
    setPairing((phase) => issueCode(phase, nextFixtureCode(codes), ONBOARDING_EPOCH_MS));
    setCodes((count) => count + 1);
  };
  if (done) {
    return (
      <p className="p-10 text-center text-muted-foreground text-sm" role="status">
        Setup finished (gallery stops here).
      </p>
    );
  }
  return (
    <OnboardingFlow
      nowMs={ONBOARDING_EPOCH_MS}
      onAddHost={() => {}}
      onApprovePairing={() => setPairing((phase) => approveGrant(phase, WIRE_PAIR_RESULT_FIXTURE))}
      onDenyPairing={() => setPairing(denyRequest)}
      onFinish={() => setDone(true)}
      onHostAction={() => {}}
      onInstallService={() =>
        setState((current) => ({
          ...current,
          service: serviceReduce(current.service, { kind: "install-requested" }),
        }))
      }
      onIssueCode={issue}
      onOpenDiagnostics={() => {}}
      onOpenHost={() => {}}
      onPairingDone={() => setPairing(PAIRING_IDLE)}
      onRecheckService={() => {}}
      onStartService={() =>
        setState((current) => ({
          ...current,
          service: serviceReduce(current.service, { kind: "start-requested" }),
        }))
      }
      onStateChange={setState}
      onTogglePairingCapability={(capability) =>
        setPairing((phase) => toggleGrant(phase, capability))
      }
      pairing={pairing}
      projectChoices={DEFAULT_PROJECT_CHOICES}
      state={state}
    />
  );
}

function PairingScene({ initial }: { readonly initial: PairingPhase }) {
  const [phase, setPhase] = useState(initial);
  const [codes, setCodes] = useState(0);
  return (
    <div className="mx-auto w-full max-w-lg p-6">
      <PairingPanel
        hostName="This computer"
        nowMs={ONBOARDING_EPOCH_MS}
        onApprove={() => setPhase((current) => approveGrant(current, WIRE_PAIR_RESULT_FIXTURE))}
        onDeny={() => setPhase(denyRequest)}
        onDone={() => setPhase(PAIRING_IDLE)}
        onIssueCode={() => {
          setPhase((current) => {
            const issued = issueCode(current, nextFixtureCode(codes), ONBOARDING_EPOCH_MS);
            // A second click while a code is out simulates the device
            // presenting it, so the review step is reachable interactively.
            return current.kind === "code-issued"
              ? deviceRequested(current, PAIRING_REQUEST_FIXTURE)
              : issued;
          });
          setCodes((count) => count + 1);
        }}
        onToggleCapability={(capability) =>
          setPhase((current) => toggleGrant(current, capability))
        }
        phase={phase}
      />
    </div>
  );
}

function DevicesScene({ initial }: { readonly initial: readonly PairedDevice[] }) {
  const [devices, setDevices] = useState(initial);
  return (
    <div className="mx-auto w-full max-w-lg p-6">
      <PairedDeviceManager
        devices={devices}
        hostName="This computer"
        nowMs={ONBOARDING_EPOCH_MS}
        onRevoke={(deviceId) => setDevices((current) => revokeDevice(current, deviceId))}
      />
    </div>
  );
}

export function OnboardingGallery({ scene }: { readonly scene: GalleryScene }) {
  const scenarioKey = FLOW_SCENE_TO_SCENARIO[scene];
  if (scenarioKey !== undefined) {
    const scenario = ONBOARDING_SCENARIOS[scenarioKey];
    if (scenario !== undefined) return <FlowScene scenario={scenario} />;
  }
  const pairingKey = PAIRING_SCENE_TO_FIXTURE[scene];
  if (pairingKey !== undefined) {
    const fixture = PAIRING_FIXTURES[pairingKey];
    if (fixture !== undefined) return <PairingScene initial={fixture} />;
  }
  if (scene === "host-menu") {
    return (
      <div className="mx-auto w-full max-w-lg p-6">
        <HostConnectionMenu
          hosts={HOST_MENU_FIXTURE}
          onAddHost={() => {}}
          onHostAction={() => {}}
          onOpenHost={() => {}}
        />
      </div>
    );
  }
  if (scene === "devices") return <DevicesScene initial={DEVICE_FIXTURES} />;
  if (scene === "devices-empty") return <DevicesScene initial={[]} />;
  return (
    <p className="p-10 text-center text-muted-foreground text-sm">
      Unknown scene. Valid: {GALLERY_SCENES.join(", ")}
    </p>
  );
}
