// Onboarding feature surface: first-run flow, host connection menu, pairing
// panel, and paired-device management. Standalone — nothing here is wired
// into the shell or router yet; AppShell integration lands separately.
export { GroupLabel, ToneBadge } from "./bits.tsx";
export {
  buildRevokeConfirmation,
  focusAfterRevoke,
  type RevokeConfirmation,
  revokeDevice,
} from "./devices.ts";
export {
  advance,
  blockedReason,
  canFinish,
  createOnboarding,
  goBack,
  ONBOARDING_STAGES,
  type OnboardingStage,
  type OnboardingState,
  type ResumeBehavior,
  type SessionDefaults,
  STAGE_INFO,
  type StageInfo,
  type StepperItemState,
  stepperItems,
} from "./flow.ts";
export {
  DEFAULT_PROJECT_CHOICES,
  DEVICE_FIXTURES,
  HOST_FIXTURES,
  HOST_MENU_FIXTURE,
  ONBOARDING_EPOCH_MS,
  ONBOARDING_SCENARIOS,
  PAIRING_FIXTURES,
  PAIRING_REQUEST_FIXTURE,
  SERVICE_FIXTURES,
  SERVICE_RUNNING_LAUNCHD,
  WIRE_PAIR_RESULT_FIXTURE,
} from "./fixtures.ts";
export { HostConnectionMenu, type HostConnectionMenuProps } from "./HostConnectionMenu.tsx";
export {
  groupHosts,
  HOST_CONNECTION_STATES,
  HOST_STATE_META,
  type HostAction,
  type HostActionId,
  type HostConnectionState,
  type HostGroup,
  type HostKind,
  type HostRow,
  hostIsUsable,
  type HostStateMeta,
  type HostStateTone,
} from "./hosts.ts";
export {
  CAPABILITIES,
  CAPABILITY_BY_ID,
  type CapabilityId,
  type CapabilityInfo,
  capabilityLabels,
  DEVICE_PLATFORM_LABELS,
  type DevicePlatform,
  deviceFromPairResult,
  formatLastSeen,
  type PairedDevice,
  type PeerIdentity,
  type WirePairResult,
} from "./model.ts";
export { OnboardingFlow, type OnboardingFlowProps } from "./OnboardingFlow.tsx";
export {
  approveGrant,
  canRetry,
  codeSecondsLeft,
  denyRequest,
  deviceRequested,
  identityMismatch,
  issueCode,
  MEMBERSHIP_NOT_TRUST_COPY,
  PAIRING_CODE_TTL_MS,
  PAIRING_IDLE,
  PAIRING_MAX_ATTEMPTS,
  type PairingPhase,
  type PairingRequest,
  tick,
  toggleGrant,
} from "./pairing.ts";
export { PairedDeviceManager, type PairedDeviceManagerProps } from "./PairedDeviceManager.tsx";
export { PairingPanel, type PairingPanelProps } from "./PairingPanel.tsx";
export {
  initialService,
  SERVICE_PLATFORM_LABELS,
  SERVICE_STATUS_META,
  type ServiceEvent,
  type ServicePlatform,
  type ServiceStatus,
  type ServiceStatusMeta,
  serviceReduce,
  type ServiceViewModel,
} from "./service.ts";
