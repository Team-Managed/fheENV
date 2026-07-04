export function parseEnv(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const commentIdx = value.indexOf(" #");
    if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    if (key) result[key] = value;
  }
  return result;
}

export function serializeEnv(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([k, v]) => {
      const needsQuotes = /[\s#"'\\]/.test(v);
      return `${k}=${needsQuotes ? `"${v.replace(/"/g, '\\"')}"` : v}`;
    })
    .join("\n");
}
