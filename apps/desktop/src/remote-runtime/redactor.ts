const SECRET_KEY = /token|secret|password|credential|authorization|ciphertext|private|api[_-]?key|ssh[_-]?user|endpoint|socket|path/iu;

export function redactRemoteDiagnostics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactRemoteDiagnostics(item));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = SECRET_KEY.test(key) ? "[redacted]" : redactRemoteDiagnostics(item);
    return result;
  }
  if (typeof value === "string" && /(?:bearer\s+|token[=:]|secret[=:])/iu.test(value)) return "[redacted]";
  return value;
}
