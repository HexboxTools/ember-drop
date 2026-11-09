/** Shared request checks for the private chipnet Electrum relay (no sockets). */
export const ALLOWED_METHODS = new Set([
  'server.ping',
  'server.version',
  'blockchain.headers.get_tip',
  'blockchain.scripthash.listunspent',
  'blockchain.transaction.get',
  'blockchain.transaction.broadcast',
]);

export function authorize(authHeader, token) {
  if (!token) return { ok: false, status: 401, error: 'unauthorized' };
  if (authHeader !== `Bearer ${token}`) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
}

export function parseRpcBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, status: 400, error: 'invalid json' };
  const method = body.method;
  const params = body.params === undefined ? [] : body.params;
  if (typeof method !== 'string' || !ALLOWED_METHODS.has(method)) return { ok: false, status: 400, error: 'method not allowed' };
  if (!Array.isArray(params)) return { ok: false, status: 400, error: 'params must be an array' };
  return { ok: true, method, params };
}
