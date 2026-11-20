// A web page cannot write directly to the iOS Photos library. Start a normal browser download
// from the user's tap, without forcing the game's own intermediate image viewer.
export function requestResultCardDownload({ controller, doc = globalThis.document } = {}) {
  let url;
  try { url = controller?.getImageUrl?.(); } catch { return false; }
  if (typeof url !== 'string' || !url || typeof doc?.createElement !== 'function' || !doc.body?.append) return false;
  const link = doc.createElement('a');
  link.href = url;
  link.download = 'chameleol-result.png';
  link.hidden = true;
  try {
    doc.body.append(link);
    link.click();
    return true;
  } catch {
    return false;
  } finally {
    link.remove?.();
    // Do not revoke the object URL here: Safari may read it after the click handler exits.
    // The result-card controller revokes it when the card changes or is disposed.
  }
}
