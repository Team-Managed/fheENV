const WALLETCONNECT_URI = /wc:[^\s]+/gi;
const URL_CREDENTIAL = /(https?:\/\/)([^/\s@]+@)/gi;
const SENSITIVE_QUERY = /([?&](?:api[_-]?key|token|jwt|secret|password|symKey)=)[^&#\s]+/gi;

export class SensitiveValueRegistry {
  private readonly values = new Set<string>();

  register(value: string | undefined): void {
    if (value && value.length >= 4) this.values.add(value);
  }

  redact(input: string): string {
    let output = input;
    for (const value of this.values) {
      output = output.split(value).join("[REDACTED]");
    }
    return output
      .replace(WALLETCONNECT_URI, "[REDACTED_WALLETCONNECT_URI]")
      .replace(URL_CREDENTIAL, "$1[REDACTED]@")
      .replace(SENSITIVE_QUERY, "$1[REDACTED]");
  }
}

export function sanitizeError(
  error: unknown,
  registry: SensitiveValueRegistry,
  options: { debug?: boolean } = {},
): string {
  const value =
    error instanceof Error
      ? options.debug && error.stack
        ? error.stack
        : error.message
      : String(error);
  return registry.redact(value).slice(0, 8_192);
}
