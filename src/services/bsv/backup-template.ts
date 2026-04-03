/**
 * backup-template.ts
 * Generates a self-contained HTML recovery file for BSVibes identities.
 * The generated file works entirely offline — no network calls, no external scripts.
 */

// The BSVibes icon SVG, embedded as a base64 favicon.
// Source: public/icon.svg
const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
  '<rect width="512" height="512" rx="96" fill="#000000"/>' +
  '<rect x="0" y="0" width="512" height="8" rx="4" fill="#f59e0b"/>' +
  '<text x="256" y="300" font-family="ui-monospace,\'SF Mono\',\'Cascadia Code\',monospace"' +
  ' font-weight="800" font-size="220" fill="#f59e0b" text-anchor="middle"' +
  ' dominant-baseline="middle" letter-spacing="-8">BS</text>' +
  '<circle cx="256" cy="420" r="10" fill="#f59e0b" opacity="0.5"/>' +
  '</svg>';

function svgToBase64(svg: string): string {
  // btoa only works in browser; in Node (build/server) use Buffer
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(svg).toString('base64');
  }
  return btoa(svg);
}

export interface BackupData {
  name: string;
  address: string;
  wif?: string;               // plaintext — shown immediately, no passphrase needed
  wif_encrypted?: string;     // AES-256-GCM encrypted — requires passphrase to reveal
  oldWif_encrypted?: string;  // previous key after rotation (encrypted)
  hint?: string;              // memory clue (plaintext, stored verbatim)
  createdAt: string;
  note?: string;
}

/** Escape a value for use inside an HTML attribute (title=). */
function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Returns a complete, self-contained HTML document as a string.
 * Embed it in a Blob and download as `.html`.
 *
 * Behaviour:
 *  - If `wif` is present → WIF is displayed immediately on page load (unprotected).
 *  - If `wif_encrypted` is present → passphrase input + PBKDF2/AES-GCM decrypt flow.
 */
export function generateBackupHtml(data: BackupData): string {
  const iconB64 = svgToBase64(ICON_SVG);
  const faviconUri = 'data:image/svg+xml;base64,' + iconB64;

  // Safe JSON embed — JSON.stringify handles all escaping
  const dataJson = JSON.stringify(data);

  const title = 'BSVibes Recovery \u2014 ' + data.name;
  const isPlaintext = Boolean(data.wif) && !data.wif_encrypted;

  // --- Conditional HTML section (body content) ---
  const bodySection = isPlaintext
    ? [
        '    <!-- Plaintext recovery: WIF shown immediately -->',
        '    <div class="card" id="plaintext-section">',
        '      <div class="wif-block">',
        '        <div class="wif-label">Your Key (WIF)</div>',
        '        <div class="wif-value" id="wif-display"></div>',
        '        <button class="copy-btn" id="copy-wif-btn" onclick="copyWif()">Copy</button>',
        '      </div>',
        '      <p style="font-size:11px;color:#71717a;margin-top:10px;line-height:1.5;">',
        '        This recovery file is not encrypted. Anyone with this file can access your identity.',
        '        Consider using a passphrase-protected recovery file in future.',
        '      </p>',
        '    </div>',
      ].join('\n')
    : [
        '    <!-- Encrypted recovery file: passphrase required -->',
        '    <div class="card" id="decrypt-section">',
        data.hint ? '      <div class="hint-box"><strong>Memory clue:</strong> <span id="hint-text"></span></div>' : '',
        '      <label for="passphrase-input">Enter your passphrase to reveal your key</label>',
        '      <input type="password" id="passphrase-input" placeholder="Your passphrase" autocomplete="current-password" />',
        '      <button class="primary" id="decrypt-btn" onclick="handleDecrypt()">Decrypt</button>',
        '    </div>',
        '',
        '    <div id="spinner" class="spinner"></div>',
        '',
        '    <div class="card" id="result-section" style="display:none">',
        '      <div class="success-header">',
        '        <div class="check-icon">',
        '          <svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '            <polyline points="2,6 5,9 10,3"></polyline>',
        '          </svg>',
        '        </div>',
        '        <h3>Decryption successful</h3>',
        '      </div>',
        '      <div id="wif-primary-block" class="wif-block" style="display:none">',
        '        <div class="wif-label">Your Key (WIF)</div>',
        '        <div class="wif-value" id="wif-primary"></div>',
        "        <button class=\"copy-btn\" onclick=\"copyValue('wif-primary', this)\">Copy</button>",
        '      </div>',
        '      <div id="wif-old-block" class="wif-block" style="display:none">',
        '        <div class="wif-label">Previous Key (WIF) \u2014 from before last rotation</div>',
        '        <div class="wif-value" id="wif-old"></div>',
        "        <button class=\"copy-btn\" onclick=\"copyValue('wif-old', this)\">Copy</button>",
        '      </div>',
        '    </div>',
        '',
        '    <div id="error-box" class="error-box">',
        '      <strong>Decryption failed</strong>',
        '      Wrong passphrase or corrupted data. Check your passphrase and try again.',
        '    </div>',
      ].join('\n');

  // --- Conditional JS section ---
  const jsSection = isPlaintext
    ? [
        "    // Plaintext recovery: show WIF immediately",
        "    document.getElementById('wif-display').textContent = BACKUP_DATA.wif || '';",
        "    function copyWif() {",
        "      const btn = document.getElementById('copy-wif-btn');",
        "      const text = BACKUP_DATA.wif || '';",
        "      navigator.clipboard.writeText(text).then(() => {",
        "        btn.textContent = 'Copied!'; btn.classList.add('copied');",
        "        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);",
        "      }).catch(() => {",
        "        const el = document.getElementById('wif-display');",
        "        const range = document.createRange(); range.selectNodeContents(el);",
        "        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);",
        "        document.execCommand('copy'); sel.removeAllRanges();",
        "        btn.textContent = 'Copied!'; btn.classList.add('copied');",
        "        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);",
        "      });",
        "    }",
      ].join('\n')
    : [
        "    // Show hint if present",
        "    const hintEl = document.getElementById('hint-text');",
        "    if (hintEl && BACKUP_DATA.hint) hintEl.textContent = BACKUP_DATA.hint;",
        "",
        "    // Crypto constants — must match src/services/bsv/crypto.ts exactly",
        "    const PBKDF2_ITERATIONS = 100000;",
        "    const SALT_BYTES = 16;",
        "    const IV_BYTES = 12;",
        "    const ENCRYPTED_PREFIX = 'enc:';",
        "",
        "    async function decryptStr(encryptedStr, passphrase) {",
        "      if (!encryptedStr || !encryptedStr.startsWith(ENCRYPTED_PREFIX)) return null;",
        "      try {",
        "        const combined = Uint8Array.from(atob(encryptedStr.slice(ENCRYPTED_PREFIX.length)), c => c.charCodeAt(0));",
        "        const salt = combined.slice(0, SALT_BYTES);",
        "        const iv = combined.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);",
        "        const ciphertext = combined.slice(SALT_BYTES + IV_BYTES);",
        "        const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);",
        "        const key = await crypto.subtle.deriveKey(",
        "          { name: 'PBKDF2', salt: salt.buffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },",
        "          keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']",
        "        );",
        "        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer }, key, ciphertext.buffer);",
        "        return new TextDecoder().decode(plain);",
        "      } catch { return null; }",
        "    }",
        "",
        "    async function handleDecrypt() {",
        "      const passphrase = document.getElementById('passphrase-input').value;",
        "      document.getElementById('result-section').style.display = 'none';",
        "      document.getElementById('error-box').style.display = 'none';",
        "      if (!passphrase) { showError('Please enter your passphrase.'); return; }",
        "      setLoading(true);",
        "      try {",
        "        const primaryWif = await decryptStr(BACKUP_DATA.wif_encrypted, passphrase);",
        "        if (!primaryWif) { setLoading(false); showError(null); return; }",
        "        let oldWif = null;",
        "        if (BACKUP_DATA.oldWif_encrypted) oldWif = await decryptStr(BACKUP_DATA.oldWif_encrypted, passphrase);",
        "        setLoading(false);",
        "        showSuccess(primaryWif, oldWif);",
        "      } catch (err) {",
        "        setLoading(false);",
        "        showError('Unexpected error: ' + err.message);",
        "      }",
        "    }",
        "",
        "    document.getElementById('passphrase-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleDecrypt(); });",
        "",
        "    function setLoading(on) {",
        "      const btn = document.getElementById('decrypt-btn');",
        "      const spinner = document.getElementById('spinner');",
        "      btn.disabled = on; btn.textContent = on ? 'Decrypting\u2026' : 'Decrypt';",
        "      spinner.style.display = on ? 'block' : 'none';",
        "    }",
        "",
        "    function showSuccess(primary, old) {",
        "      const pb = document.getElementById('wif-primary-block');",
        "      document.getElementById('wif-primary').textContent = primary;",
        "      pb.style.display = 'block';",
        "      const ob = document.getElementById('wif-old-block');",
        "      if (old) { document.getElementById('wif-old').textContent = old; ob.style.display = 'block'; }",
        "      else ob.style.display = 'none';",
        "      document.getElementById('result-section').style.display = 'block';",
        "    }",
        "",
        "    function showError(msg) {",
        "      const el = document.getElementById('error-box');",
        "      if (msg) el.innerHTML = '<strong>Error</strong>' + esc(msg);",
        "      else el.innerHTML = '<strong>Decryption failed</strong>Wrong passphrase or corrupted data. Check your passphrase and try again.';",
        "      el.style.display = 'block';",
        "    }",
        "",
        "    function copyValue(id, btn) {",
        "      const text = document.getElementById(id).textContent;",
        "      navigator.clipboard.writeText(text).then(() => {",
        "        btn.textContent = 'Copied!'; btn.classList.add('copied');",
        "        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);",
        "      }).catch(() => {",
        "        const range = document.createRange(); range.selectNodeContents(document.getElementById(id));",
        "        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);",
        "        document.execCommand('copy'); sel.removeAllRanges();",
        "        btn.textContent = 'Copied!'; btn.classList.add('copied');",
        "        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);",
        "      });",
        "    }",
      ].join('\n');

  return (
    '<!DOCTYPE html>\n' +
    '<!-- No network calls. Verify: View Source. -->\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '  <title>' + escapeHtmlAttr(title) + '</title>\n' +
    '  <link rel="icon" href="' + faviconUri + '" />\n' +
    '  <style>\n' +
    '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n' +
    '    body {\n' +
    '      background: #09090b; color: #f4f4f5;\n' +
    "      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n" +
    '      min-height: 100vh; display: flex; flex-direction: column;\n' +
    '      align-items: center; padding: 48px 16px 32px;\n' +
    '    }\n' +
    '    .container { width: 100%; max-width: 560px; }\n' +
    '    .logo { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; color: #10b981; margin-bottom: 6px; text-align: center; }\n' +
    '    .logo span { color: #f4f4f5; }\n' +
    '    h1 { font-size: 17px; font-weight: 600; color: #f4f4f5; text-align: center; margin-bottom: 6px; }\n' +
    '    .subtitle { font-size: 13px; color: #71717a; text-align: center; line-height: 1.5; margin-bottom: 28px; }\n' +
    '    .offline-badge {\n' +
    '      display: inline-flex; align-items: center; gap: 5px;\n' +
    '      background: #1a2e1a; border: 1px solid #166534; border-radius: 20px;\n' +
    '      font-size: 11px; font-weight: 500; color: #4ade80;\n' +
    '      padding: 3px 10px; margin: 0 auto 20px; letter-spacing: 0.02em;\n' +
    '    }\n' +
    "    .offline-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #4ade80; }\n" +
    '    .badge-wrap { display: flex; justify-content: center; }\n' +
    '    .privacy-banner {\n' +
    '      background: #0d1f1a; border: 1px solid #1a4731; border-radius: 10px;\n' +
    '      padding: 13px 16px; margin-bottom: 16px;\n' +
    '      display: flex; align-items: flex-start; gap: 11px;\n' +
    '    }\n' +
    '    .privacy-banner-icon {\n' +
    '      flex-shrink: 0; width: 32px; height: 32px;\n' +
    '      background: #14532d; border-radius: 8px;\n' +
    '      display: flex; align-items: center; justify-content: center;\n' +
    '      margin-top: 1px;\n' +
    '    }\n' +
    '    .privacy-banner-icon svg { width: 16px; height: 16px; }\n' +
    '    .privacy-banner-body { flex: 1; }\n' +
    '    .privacy-banner-title {\n' +
    '      font-size: 13px; font-weight: 600; color: #4ade80;\n' +
    '      margin-bottom: 3px; letter-spacing: 0.01em;\n' +
    '    }\n' +
    '    .privacy-banner-desc {\n' +
    '      font-size: 12px; color: #86efac; line-height: 1.5; opacity: 0.8;\n' +
    '    }\n' +
    '    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px; margin-bottom: 14px; }\n' +
    '    .meta-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; margin-bottom: 6px; }\n' +
    '    .meta-label { color: #71717a; }\n' +
    "    .meta-value { color: #a1a1aa; font-family: 'SF Mono', 'Fira Code', monospace; word-break: break-all; text-align: right; max-width: 70%; }\n" +
    '    .meta-value.name { color: #f4f4f5; font-weight: 600; font-family: inherit; }\n' +
    '    label { display: block; font-size: 12px; font-weight: 500; color: #a1a1aa; margin-bottom: 7px; letter-spacing: 0.01em; }\n' +
    '    input[type="password"] {\n' +
    '      width: 100%; background: #09090b; border: 1px solid #3f3f46;\n' +
    '      border-radius: 8px; color: #f4f4f5; font-size: 14px;\n' +
    '      padding: 10px 13px; outline: none; transition: border-color 0.15s;\n' +
    '      letter-spacing: 0.06em; margin-bottom: 12px;\n' +
    '    }\n' +
    '    input[type="password"]:focus { border-color: #10b981; }\n' +
    "    input[type=\"password\"]::placeholder { letter-spacing: 0; color: #52525b; }\n" +
    '    .hint-box {\n' +
    '      background: #1c1917; border: 1px solid #44403c; border-radius: 7px;\n' +
    '      padding: 9px 13px; font-size: 12px; color: #d97706; margin-bottom: 12px;\n' +
    '    }\n' +
    '    .hint-box strong { color: #fbbf24; }\n' +
    '    button.primary {\n' +
    '      width: 100%; background: #10b981; color: #fff; border: none;\n' +
    '      border-radius: 8px; font-size: 14px; font-weight: 600; padding: 11px;\n' +
    '      cursor: pointer; transition: background 0.15s;\n' +
    '    }\n' +
    '    button.primary:hover:not(:disabled) { background: #059669; }\n' +
    '    button.primary:disabled { opacity: 0.5; cursor: not-allowed; }\n' +
    '    .spinner {\n' +
    '      display: none; width: 18px; height: 18px; border: 2px solid #3f3f46;\n' +
    '      border-top-color: #10b981; border-radius: 50%;\n' +
    '      animation: spin 0.7s linear infinite; margin: 0 auto 14px;\n' +
    '    }\n' +
    '    @keyframes spin { to { transform: rotate(360deg); } }\n' +
    '    .wif-block { background: #09090b; border: 1px solid #3f3f46; border-radius: 8px; padding: 12px; margin-bottom: 8px; }\n' +
    '    .wif-label { font-size: 10px; font-weight: 500; color: #71717a; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; }\n' +
    "    .wif-value { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; color: #f4f4f5; word-break: break-all; line-height: 1.6; }\n" +
    '    .copy-btn {\n' +
    '      background: #27272a; border: 1px solid #3f3f46; border-radius: 6px;\n' +
    '      color: #a1a1aa; font-size: 11px; font-weight: 500; padding: 5px 11px;\n' +
    '      cursor: pointer; transition: background 0.15s, color 0.15s; margin-top: 6px;\n' +
    '    }\n' +
    '    .copy-btn:hover { background: #3f3f46; color: #f4f4f5; }\n' +
    '    .copy-btn.copied { background: #14532d; border-color: #166534; color: #4ade80; }\n' +
    '    .success-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }\n' +
    '    .check-icon {\n' +
    '      width: 20px; height: 20px; background: #10b981; border-radius: 50%;\n' +
    '      display: flex; align-items: center; justify-content: center; flex-shrink: 0;\n' +
    '    }\n' +
    '    .check-icon svg { width: 12px; height: 12px; }\n' +
    '    .success-header h3 { font-size: 13px; font-weight: 600; color: #10b981; }\n' +
    '    .error-box {\n' +
    '      display: none; background: #1c0a09; border: 1px solid #7f1d1d;\n' +
    '      border-radius: 8px; padding: 13px; font-size: 13px; color: #fca5a5;\n' +
    '    }\n' +
    '    .error-box strong { color: #f87171; display: block; margin-bottom: 3px; }\n' +
    '    footer { text-align: center; font-size: 11px; color: #52525b; margin-top: 28px; line-height: 1.6; }\n' +
    '    footer a { color: #71717a; text-decoration: none; }\n' +
    '    footer a:hover { color: #a1a1aa; }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <div class="container">\n' +
    '    <div class="logo"><span>BS</span>Vibes</div>\n' +
    '    <h1>Recovery File</h1>\n' +
    '    <p class="subtitle">This file contains your encrypted identity.<br>Keep it somewhere safe.</p>\n' +
    '    <div class="badge-wrap"><div class="offline-badge">Works offline \u2014 no network calls</div></div>\n' +
    '\n' +
    '    <div class="privacy-banner">\n' +
    '      <div class="privacy-banner-icon">\n' +
    '        <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n' +
    '          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>\n' +
    '          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>\n' +
    '        </svg>\n' +
    '      </div>\n' +
    '      <div class="privacy-banner-body">\n' +
    '        <div class="privacy-banner-title">Private &amp; Offline</div>\n' +
    '        <div class="privacy-banner-desc">This page runs entirely on your device. No data is sent anywhere.</div>\n' +
    '      </div>\n' +
    '    </div>\n' +
    '\n' +
    '    <div class="card">\n' +
    '      <div class="meta-row">\n' +
    '        <span class="meta-label">Name</span>\n' +
    '        <span class="meta-value name" id="meta-name"></span>\n' +
    '      </div>\n' +
    '      <div class="meta-row">\n' +
    '        <span class="meta-label">Address</span>\n' +
    '        <span class="meta-value" id="meta-address"></span>\n' +
    '      </div>\n' +
    '      <div class="meta-row">\n' +
    '        <span class="meta-label">Saved</span>\n' +
    '        <span class="meta-value" id="meta-date"></span>\n' +
    '      </div>\n' +
    '    </div>\n' +
    '\n' +
    bodySection + '\n' +
    '\n' +
    '    <footer>\n' +
    '      This file works offline. No data is sent anywhere.<br>\n' +
    '      <a href="https://bsvibes.com" target="_blank" rel="noopener">bsvibes.com</a>\n' +
    '    </footer>\n' +
    '  </div>\n' +
    '\n' +
    '  <script>\n' +
    '    // @BACKUP_DATA_START\n' +
    '    const BACKUP_DATA = ' + dataJson + ';\n' +
    '    // @BACKUP_DATA_END\n' +
    '\n' +
    "    function esc(str) {\n" +
    "      return String(str)\n" +
    "        .replace(/&/g, '&amp;').replace(/</g, '&lt;')\n" +
    "        .replace(/>/g, '&gt;').replace(/\"/g, '&quot;');\n" +
    "    }\n" +
    '\n' +
    "    document.getElementById('meta-name').textContent = BACKUP_DATA.name || '\u2014';\n" +
    "    document.getElementById('meta-address').textContent = BACKUP_DATA.address || '\u2014';\n" +
    '    try {\n' +
    '      const d = new Date(BACKUP_DATA.createdAt);\n' +
    "      document.getElementById('meta-date').textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });\n" +
    "    } catch { document.getElementById('meta-date').textContent = BACKUP_DATA.createdAt || '\u2014'; }\n" +
    '\n' +
    jsSection + '\n' +
    '  </script>\n' +
    '</body>\n' +
    '</html>'
  );
}

/**
 * Download a backup as a self-contained HTML file.
 */
export function downloadBackup(data: BackupData, filename: string): void {
  const html = generateBackupHtml(data);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Read the stored passphrase hint from encrypted identity storage.
 */
export function getStoredHint(): string | undefined {
  try {
    const raw = localStorage.getItem('bfn_keypair_enc');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { hint?: string };
    return parsed.hint || undefined;
  } catch {
    return undefined;
  }
}
