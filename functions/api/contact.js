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

export async function onRequestGet({ request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const key = await getCryptoKey(env.JWT_SECRET);
  const timestamp = Date.now();

  // Create a cryptographically secure random 8-byte nonce
  const randomBuffer = new Uint8Array(8);
  crypto.getRandomValues(randomBuffer);
  const nonceHex = Array.from(randomBuffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Append the nonce to the payload. 
  // Even if timestamp and IP match perfectly, the payload is now unique.
  const payload = `${ip}|#|${timestamp}|#|${nonceHex}`;

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));

  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const token = btoa(`${payload}|#|${signature}`);
  return json({ token });
}

// 2. POST: Validates the token and processes the message submission
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'Ogiltig JSON'); }

  const { name = '', email = '', message = '', token = '' } = body;
  if (!name.trim() || !email.trim() || !message.trim()) {
    return err(400, 'Alla fält måste fyllas i.');
  }

  // Token Integrity and Velocity Filter Validation
  if (!token) return err(403, 'Verifiering saknas');

  try {
    const decoded = atob(token);

    const payloadParts = decoded.split('|#|');
    if (payloadParts.length !== 4) return err(403, 'Felaktigt tokenformat');

    const [ip, timestampStr, nonceHex, signatureHex] = payloadParts;
    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

    if (ip !== clientIp) return err(403, 'IP-adressen matchar inte');

    const reconstructedPayload = `${ip}|#|${timestampStr}|#|${nonceHex}`;

    const payloadBytes = new TextEncoder().encode(reconstructedPayload);
    const signatureBytes = new Uint8Array(signatureHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    const key = await getCryptoKey(env.JWT_SECRET);
    const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);

    if (!isValid) return err(403, 'Ogiltig verifieringstoken');

    const elapsed = Date.now() - parseInt(timestampStr, 10);
    if (elapsed < 6000) return err(403, 'För snabb interaktion.');
    if (elapsed > 900000) return err(403, 'Token har löpt ut.');

  } catch (e) {
    return err(403, `Verifieringen misslyckades: ${e.message}`);
  }

  await env.DB.prepare(
    'INSERT INTO contacts (id, name, email, message, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(uid(), name.trim(), email.trim(), message.trim(), new Date().toISOString()).run()

  return ok();
}

function ok() { return json({ ok: true }); }
function err(s, msg) { return json({ error: msg }, s); }
function json(body, s = 200) {
  return new Response(JSON.stringify(body), {
    status: s, headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}