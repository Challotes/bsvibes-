import { describe, expect, it } from "vitest";
import { parseRecoveryText } from "./restore-from-file";

describe("parseRecoveryText", () => {
  it("parses HTML with marker block + encrypted payload", () => {
    const html = `<!DOCTYPE html><html><head></head><body><script>
      // @BACKUP_DATA_START
      const BACKUP_DATA = {"wif_encrypted":"enc:abc123","name":"anon_test","hint":"my hint"};
      // @BACKUP_DATA_END
    </script></body></html>`;
    const result = parseRecoveryText(html);
    expect(result).toEqual({
      ok: true,
      payload: {
        kind: "encrypted",
        wif_encrypted: "enc:abc123",
        name: "anon_test",
        hint: "my hint",
      },
    });
  });

  it("parses HTML with legacy const BACKUP_DATA (no marker)", () => {
    const html = `<!DOCTYPE html><html><body><script>
      const BACKUP_DATA = {"wif_encrypted":"enc:legacy","name":"anon_old"};
    </script></body></html>`;
    const result = parseRecoveryText(html);
    expect(result).toEqual({
      ok: true,
      payload: {
        kind: "encrypted",
        wif_encrypted: "enc:legacy",
        name: "anon_old",
      },
    });
  });

  it("parses HTML with plain wif payload", () => {
    const html = `<!DOCTYPE html><html><body><script>
      // @BACKUP_DATA_START
      const BACKUP_DATA = {"wif":"L1plainKey","name":"anon_x"};
      // @BACKUP_DATA_END
    </script></body></html>`;
    const result = parseRecoveryText(html);
    expect(result).toEqual({
      ok: true,
      payload: { kind: "plain", wif: "L1plainKey", name: "anon_x" },
    });
  });

  it("parses standalone JSON file with encrypted payload", () => {
    const json = `{"wif_encrypted":"enc:abc","name":"anon_json","hint":"clue"}`;
    const result = parseRecoveryText(json);
    expect(result).toEqual({
      ok: true,
      payload: {
        kind: "encrypted",
        wif_encrypted: "enc:abc",
        name: "anon_json",
        hint: "clue",
      },
    });
  });

  it("parses standalone JSON file with plain wif", () => {
    const json = `{"wif":"L1plain","name":"anon_p"}`;
    const result = parseRecoveryText(json);
    expect(result).toEqual({
      ok: true,
      payload: { kind: "plain", wif: "L1plain", name: "anon_p" },
    });
  });

  it("returns parse_failed for invalid HTML (BACKUP_DATA absent)", () => {
    const html = `<!DOCTYPE html><html><body>nothing here</body></html>`;
    expect(parseRecoveryText(html)).toEqual({ ok: false, error: "parse_failed" });
  });

  it("returns parse_failed for malformed JSON", () => {
    expect(parseRecoveryText(`{not valid json`)).toEqual({ ok: false, error: "parse_failed" });
  });

  it("returns parse_failed for random text", () => {
    expect(parseRecoveryText("this is not a recovery file")).toEqual({
      ok: false,
      error: "parse_failed",
    });
  });

  it("returns parse_failed for empty input", () => {
    expect(parseRecoveryText("")).toEqual({ ok: false, error: "parse_failed" });
  });

  it("returns no_key when JSON is valid but has neither wif nor wif_encrypted", () => {
    expect(parseRecoveryText(`{"name":"anon_x","hint":"clue"}`)).toEqual({
      ok: false,
      error: "no_key",
    });
  });

  it("handles HTML detection via BACKUP_DATA substring even without doctype", () => {
    const html = `<some-html><script>const BACKUP_DATA = {"wif":"L1noDoctype"};</script>`;
    const result = parseRecoveryText(html);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({ kind: "plain", wif: "L1noDoctype" });
    }
  });
});
