// Attachment intake rules for the composer. Pure and unit-testable: paste
// and drop handlers reduce their DataTransfer contents to AttachmentCandidate
// values and let this module decide what is accepted and why not.
import type { PromptAttachment } from "../session-runtime/intents.ts";

export const MAX_ATTACHMENTS = 8;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const IMAGE_TYPES: Record<string, true> = {
  "image/png": true,
  "image/jpeg": true,
  "image/webp": true,
  "image/gif": true,
};

const TEXT_LIKE_PATTERN = /^(text\/|application\/(json|x-yaml|xml|toml))/;

export interface AttachmentCandidate {
  readonly name: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
}

export interface AttachmentIntake {
  readonly accepted: readonly PromptAttachment[];
  /** One plain-language line per rejected candidate. */
  readonly rejections: readonly string[];
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} B`;
}

/**
 * Validate candidates against the current attachment list. Images and
 * text-like files are accepted up to the size and count limits; duplicates
 * (same name and size) are dropped with a reason.
 */
export function admitAttachments(
  existing: readonly PromptAttachment[],
  candidates: readonly AttachmentCandidate[],
): AttachmentIntake {
  const accepted: PromptAttachment[] = [];
  const rejections: string[] = [];
  let count = existing.length;
  for (const candidate of candidates) {
    const name = candidate.name || "untitled";
    if (count >= MAX_ATTACHMENTS) {
      rejections.push(`${name}: limit of ${MAX_ATTACHMENTS} attachments reached.`);
      continue;
    }
    const isImage = IMAGE_TYPES[candidate.mediaType] === true;
    const isTextLike = TEXT_LIKE_PATTERN.test(candidate.mediaType);
    if (!isImage && !isTextLike) {
      rejections.push(`${name}: only images and text files attach here.`);
      continue;
    }
    if (candidate.sizeBytes > MAX_ATTACHMENT_BYTES) {
      rejections.push(
        `${name}: ${formatBytes(candidate.sizeBytes)} is over the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit.`,
      );
      continue;
    }
    const duplicate =
      existing.some(
        (attachment) =>
          attachment.name === name && attachment.sizeBytes === candidate.sizeBytes,
      ) ||
      accepted.some(
        (attachment) =>
          attachment.name === name && attachment.sizeBytes === candidate.sizeBytes,
      );
    if (duplicate) {
      rejections.push(`${name}: already attached.`);
      continue;
    }
    accepted.push({
      id: `${name}\u0000${candidate.sizeBytes}\u0000${count}`,
      name,
      mediaType: candidate.mediaType,
      sizeBytes: candidate.sizeBytes,
      kind: isImage ? "image" : "file",
    });
    count += 1;
  }
  return { accepted, rejections };
}
