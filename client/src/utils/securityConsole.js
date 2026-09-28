/**
 * Security Console Warning
 * Displays a prominent, high-visibility warning banner in the browser's developer console
 * to warn users against Self-XSS attacks and unauthorized script execution.
 */
export function initSecurityConsoleWarning() {
  if (typeof window === 'undefined') return;

  const displayWarning = () => {
    const bannerStyle = [
      'color: #ffffff',
      'background: #dc2626',
      'font-size: 24px',
      'font-weight: 900',
      'padding: 8px 16px',
      'border-radius: 6px',
      'display: inline-block',
      'margin: 6px 0',
      'text-shadow: 1px 1px 2px #000',
    ].join(';');

    const headerStyle = [
      'color: #ef4444',
      'font-size: 16px',
      'font-weight: 800',
      'line-height: 1.6',
    ].join(';');

    const bodyStyle = [
      'color: #fca5a5',
      'font-size: 13px',
      'font-weight: 600',
      'line-height: 1.6',
    ].join(';');

    const bulletStyle = [
      'color: #f1f5f9',
      'background: #0f172a',
      'font-size: 12px',
      'font-family: monospace',
      'padding: 4px 8px',
      'border-radius: 4px',
      'display: inline-block',
      'margin: 3px 0',
    ].join(';');

    const footerStyle = [
      'color: #38bdf8',
      'font-size: 12px',
      'font-weight: 700',
      'margin-top: 6px',
    ].join(';');

    console.log('%c🛑 WARNING: HIGH-SECURITY ZERO-KNOWLEDGE VAULT 🛑', bannerStyle);
    console.log(
      '%cDO NOT PASTE OR EXECUTE ANY CODE OR COMMANDS HERE!',
      headerStyle
    );
    console.log(
      '%cThis is a protected security environment. If someone instructed you to copy and paste code here to "unlock features", "gain access", or "run scripts", it is an attack (Self-XSS) attempting to steal your private cryptographic keys and files.',
      bodyStyle
    );
    console.log(
      '%c🔒 E2EE: Client-side AES-256-GCM + ECDH P-256 active.\n🛡️ Zero-Knowledge: Keys never touch the server.\n📝 Audit: All vault operations are cryptographically tracked.',
      bulletStyle
    );
    console.log(
      '%c🛡️ SecureVault Cryptographic Security Framework — https://naitik.app',
      footerStyle
    );
  };

  // Run on initial page load
  try {
    displayWarning();
  } catch (e) {
    // ignore
  }

  // Also redisplay periodically or on window focus
  window.addEventListener('focus', () => {
    try {
      displayWarning();
    } catch (e) {}
  });
}
