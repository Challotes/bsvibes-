/**
 * Pure file-format parser for BSVibes recovery files. No side effects (no DOM,
 * no storage, no network). Returns a typed payload that callers (`RestoreModal`,
 * `HomeScreenWelcomeGate`) hand off to `decryptWif` and/or `importIdentity`.
 *
 * Supports three formats:
 * - HTML files with the marker block (`@BACKUP_DATA_START ... @BACKUP_DATA_END`)
 *   — the current canonical format produced by `services/bsv/backup-template.ts`
 * - HTML files with legacy `const BACKUP_DATA = {...}` syntax (pre-marker files)
 * - Pure JSON files (`{ "wif": "..." }` or `{ "wif_encrypted": "..." }`)
 *
 * The parsing regex is identical to `RestoreModal`'s inline parser — extracted
 * so the welcome-gate restore path can use it without depending on RestoreModal,
 * which requires a `currentIdentity` that doesn't exist at welcome-gate time.
 */

export type RecoveryFilePayload =
  | { kind: "plain"; wif: string; name?: string }
  | { kind: "encrypted"; wif_encrypted: string; name?: string; hint?: string };

export type ParseRecoveryFileResult =
  | { ok: true; payload: RecoveryFilePayload }
  | { ok: false; error: "parse_failed" | "no_key" };

/** Internal — synchronous parse of the file's text content. Exported for tests. */
export function parseRecoveryText(text: string): ParseRecoveryFileResult {
  const trimmed = text.trimStart();
  let parsed: { wif?: string; wif_encrypted?: string; name?: string; hint?: string } | null = null;

  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    text.includes("BACKUP_DATA")
  ) {
    const markerMatch = text.match(
      /@BACKUP_DATA_START[\s\S]*?const BACKUP_DATA\s*=\s*(\{[\s\S]*?\});\s*\/\/\s*@BACKUP_DATA_END/
    );
    if (markerMatch) {
      try {
        parsed = JSON.parse(markerMatch[1]);
      } catch {
        /* fall through to legacy attempt */
      }
    }
    if (!parsed) {
      const legacyMatch = text.match(/const BACKUP_DATA\s*=\s*(\{[\s\S]*?\});/);
      if (legacyMatch) {
        try {
          parsed = JSON.parse(legacyMatch[1]);
        } catch {
          /* fall through to parse_failed below */
        }
      }
    }
    if (!parsed) return { ok: false, error: "parse_failed" };
  } else if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: "parse_failed" };
    }
  } else {
    return { ok: false, error: "parse_failed" };
  }

  if (parsed?.wif_encrypted) {
    return {
      ok: true,
      payload: {
        kind: "encrypted",
        wif_encrypted: parsed.wif_encrypted,
        name: parsed.name,
        hint: parsed.hint,
      },
    };
  }
  if (parsed?.wif) {
    return {
      ok: true,
      payload: { kind: "plain", wif: parsed.wif, name: parsed.name },
    };
  }
  return { ok: false, error: "no_key" };
}

/**
 * Read a File via FileReader, then run `parseRecoveryText` on the result.
 * Resolves with a typed `ParseRecoveryFileResult` — never throws on bad input.
 */
export async function parseRecoveryFile(file: File): Promise<ParseRecoveryFileResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      resolve(parseRecoveryText(text));
    };
    reader.onerror = () => resolve({ ok: false, error: "parse_failed" });
    reader.readAsText(file);
  });
}
