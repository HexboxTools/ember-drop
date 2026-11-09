/**
 * Private chipnet Electrum JSON-RPC relay.
 * Box egress is :443-only; this worker uses cloudflare:sockets to reach
 * chipnet Electrum on 50001/50002, then exposes HTTPS :443 to the box.
 * Not a public listing: Bearer token required for every RPC. Do not list it.
 */
import { connect } from 'cloudflare:sockets';
import { authorize, parseRpcBody } from './lib.js';

const TARGETS = [
  { hostname: 'chipnet.bch.ninja', port: 50001, tls: false },
  { hostname: 'chipnet.imaginary.cash', port: 50001, tls: false },
  { hostname: 'chipnet.bch.ninja', port: 50002, tls: true },
  { hostname: 'chipnet.imaginary.cash', port: 50002, tls: true },
];

async function readJsonLine(reader, dec, expectId, ms) {
  let buf = '';
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    const read = await Promise.race([
      reader.read(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('read timeout')), remaining)),
    ]);
    if (read.done) throw new Error('socket closed');
    buf += dec.decode(read.value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id === expectId) return msg;
    }
  }
  throw new Error(`read timeout waiting for id ${expectId}`);
}

async function electrumRpcOnce(target, method, params) {
  const socket = target.tls
    ? connect({ hostname: target.hostname, port: target.port }, { secureTransport: 'on' })
    : connect({ hostname: target.hostname, port: target.port });
  const opened = socket.opened ?? Promise.resolve();
  await Promise.race([
    opened,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`connect timeout ${target.hostname}:${target.port}`)), 8000)),
  ]);
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const send = (obj) => writer.write(enc.encode(`${JSON.stringify(obj)}\n`));
  try {
    await send({ jsonrpc: '2.0', id: 0, method: 'server.version', params: ['hexbox-chipnet-relay', '1.5'] });
    const hello = await readJsonLine(reader, dec, 0, 8000);
    if (hello.error) throw new Error(typeof hello.error === 'string' ? hello.error : JSON.stringify(hello.error));
    await send({ jsonrpc: '2.0', id: 1, method, params });
    const msg = await readJsonLine(reader, dec, 1, 15000);
    if (msg.error) throw new Error(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error));
    return msg.result;
  } finally {
    try { reader.releaseLock(); } catch {}
    try { writer.releaseLock(); } catch {}
    try { socket.close(); } catch {}
  }
}

async function electrumRpc(method, params) {
  const errors = [];
  for (const target of TARGETS) {
    try {
      return await electrumRpcOnce(target, method, params);
    } catch (e) {
      errors.push(`${target.hostname}:${target.port}/${target.tls ? 'tls' : 'tcp'}: ${e.message || e}`);
    }
  }
  throw new Error(errors.join(' | '));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, service: 'chipnet-relay', tokenConfigured: Boolean(env.RELAY_TOKEN) });
    }
    const authz = authorize(req.headers.get('authorization') || '', env.RELAY_TOKEN);
    if (!authz.ok) return Response.json({ error: authz.error }, { status: authz.status });
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
    const parsed = parseRpcBody(body);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
    try {
      const result = await electrumRpc(parsed.method, parsed.params);
      return Response.json({ result });
    } catch (e) {
      return Response.json({ error: String(e.message || e) }, { status: 502 });
    }
  },
};
