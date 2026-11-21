// The native share call must stay in the user's tap, before any asynchronous work.
const inFlight = new WeakSet();

export async function sharePreparedResult({prepared,currentRevision,text='',url=null,navigator=globalThis.navigator,shareImpl=null} = {}) {
  const file=prepared?.file;
  if (!navigator || (typeof navigator!=='object' && typeof navigator!=='function') ||
      !file || file.type!=='image/png' || !file.size || prepared.revision!==currentRevision ||
      typeof navigator.canShare!=='function' || (typeof shareImpl!=='function' && typeof navigator.share!=='function') || inFlight.has(navigator)) return 'unavailable';
  const payload={files:[file],text:String(text)};
  if (typeof url==='string' && url.trim()) payload.url=url.trim();
  try {
    if (!navigator.canShare({files:payload.files}) || !navigator.canShare(payload)) return 'unavailable';
    inFlight.add(navigator);
    // No awaits between the capability checks and the OS share request.
    await (shareImpl?shareImpl(payload):navigator.share(payload));
    return 'shared';
  } catch(error) {
    return error?.name==='AbortError'?'cancelled':'failed';
  } finally { inFlight.delete(navigator); }
}
