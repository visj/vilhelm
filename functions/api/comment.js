// Verification secret initialization
async function getCryptoKey(secret) {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// 1. GET: Generate the token
export async function onRequestGet({ request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const key = await getCryptoKey(env.JWT_SECRET);
  const timestamp = Date.now().toString();

  const randomBuffer = new Uint8Array(8);
  crypto.getRandomValues(randomBuffer);
  const nonceHex = Array.from(randomBuffer).map(b => b.toString(16).padStart(2, '0')).join('');

  // Use the robust delimiter |#|
  const payload = `${ip}|#|${timestamp}|#|${nonceHex}`;

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));

  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Encode the entire structure
  const token = btoa(`${payload}|#|${signatureHex}`);
  return json({ token });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'Ogiltig JSON'); }

  const { id = '', parent_id = '', post = '', name = '', email = '', comment = '', token = '' } = body;
  if (!id.trim() || !post.trim() || !name.trim() || !email.trim() || !comment.trim()) {
    return err(400, 'Ogiltiga fält');
  }
  
  try {
    const decoded = atob(token);

    const payloadParts = decoded.split('|#|');
    if (payloadParts.length !== 4) return err(403, 'Felaktigt tokenformat');

    const [ip, timestampStr, nonceHex, signatureHex] = payloadParts;
    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

    if (ip !== clientIp) return err(403, 'IP-adressen matchar inte');

    const reconstructedPayload = `${ip}|#|${timestampStr}|#|${nonceHex}`;

    const payloadBytes = new TextEncoder().encode(reconstructedPayload); // Use the raw payload string
    const signatureBytes = new Uint8Array(signatureHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    const key = await getCryptoKey(env.JWT_SECRET);
    const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);

    if (!isValid) return err(403, 'Ogiltig verifieringstoken');

    const elapsed = Date.now() - parseInt(timestampStr, 10);
    if (elapsed < 6000) return err(403, 'För snabb interaktion.');
    if (elapsed > 900000) return err(403, 'Token har löpt ut.');

  } catch (e) {
    return err(403, `Verifieringsfel: ${e.message}`);
  }
  await env.DB.prepare(
    'INSERT INTO comments (id, parent_id, post, name, email, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id.trim(), parent_id.trim(), post.trim(), name.trim(), email.trim(), comment.trim(), new Date().toISOString()).run();

  return ok();
}

// Helper functions (keep these as they are)
function ok() { return json({ ok: true }); }
function err(s, msg) { return json({ error: msg }, s); }
function json(body, s = 200) {
  return new Response(JSON.stringify(body), {
    status: s,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}