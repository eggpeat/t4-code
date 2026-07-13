// Paired-device management model: the list, the revoke confirmation scope,
// and the focus-restoration contract for the confirm dialog. Revoking is
// destructive and immediate, so the confirmation names the device, the
// host, and exactly what access disappears.
import { capabilityLabels, type PairedDevice } from "./model.ts";

/**
 * Everything the revoke dialog says, derived in one place so tests can hold
 * the copy to the "names host, device, and capability impact" contract.
 */
export interface RevokeConfirmation {
  readonly deviceId: string;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  /** Element to focus once the dialog closes, however it closes. */
  readonly returnFocusId: string;
}

export function buildRevokeConfirmation(
  device: PairedDevice,
  hostName: string,
  returnFocusId: string,
): RevokeConfirmation {
  return {
    deviceId: device.id,
    title: `Revoke ${device.label}?`,
    body:
      `${device.label} (${device.identity.account}) immediately loses the ability to ` +
      `${capabilityLabels(device.capabilities)} on ${hostName}. ` +
      `If it is connected right now, it gets disconnected. ` +
      `Pairing it again starts from a fresh code.`,
    confirmLabel: `Revoke ${device.label}`,
    returnFocusId,
  };
}

/** Remove the device; unknown ids leave the list untouched. */
export function revokeDevice(
  devices: readonly PairedDevice[],
  deviceId: string,
): readonly PairedDevice[] {
  if (!devices.some((device) => device.id === deviceId)) return devices;
  return devices.filter((device) => device.id !== deviceId);
}

/**
 * Where focus lands after a revoke removes a row: the next row's revoke
 * button, else the previous row's, else the list container itself.
 */
export function focusAfterRevoke(
  devices: readonly PairedDevice[],
  revokedId: string,
): string {
  const index = devices.findIndex((device) => device.id === revokedId);
  if (index === -1) return "paired-device-list";
  const next = devices[index + 1] ?? devices[index - 1];
  return next === undefined ? "paired-device-list" : `revoke-device-${next.id}`;
}
