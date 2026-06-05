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

// 1. GET: Automatically handles token generation upon contact page load
export async function onRequestGet({ request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const timestamp = Date.now();
  const payload = `${ip}:${timestamp}`;

  const key = await getCryptoKey(env.JWT_SECRET);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));

  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const token = btoa(`${payload}.${signature}`);
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
    // 1. Decode the outer token wrap
    const decoded = atob(token);
    const [ip, timestampStr, signatureHex] = decoded.split(/[:.]/);
    const timestamp = parseInt(timestampStr, 10);
    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

    // 2. Convert the hex signature string back into a Uint8Array buffer
    const signatureBytes = new Uint8Array(
      signatureHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );

    // 3. Verify the signature cryptographically using native Web Crypto
    const payloadBytes = new TextEncoder().encode(`${ip}:${timestampStr}`);
    const key = await getCryptoKey(env.JWT_SECRET || env.TURNSTILE_SECRET);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      payloadBytes
    );

    if (!isValid) return err(403, 'Ogiltig verifieringstoken');
    if (ip !== clientIp) return err(403, 'IP-adressen matchar inte');

    // 4. Enforce 8 seconds time lock
    const elapsed = Date.now() - timestamp;
    if (elapsed < 8000) return err(403, 'Du skickade meddelandet för snabbt (bot-skydd).');
    if (elapsed > 900000) return err(403, 'Säkerhetstoken har löpt ut. Ladda om sidan och försök igen.');

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
  return new Response(JSON.stringify(body), { status: s, headers: { 'Content-Type': 'application/json' } });
}