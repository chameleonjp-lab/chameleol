// A legacy named record can be bound to an endpoint once that endpoint recognizes
// the original play and secret. Legacy anonymous launches have no such proof.
export async function canSendRecord(api, record) {
  if (record.destination !== undefined) return record.destination != null && record.destination === api.destination;
  const playId = record.playId ?? record.response?.playId;
  if (!playId || !record.secret) return false;
  const { items } = await api.post('status', { items: [{ playId, secret: record.secret }] });
  return items?.some(item => item.playId === playId && !item.error && typeof item.status === 'string') === true;
}
