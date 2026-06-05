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
  const timestamp = Date.now().toString();
  
  const randomBuffer = new Uint8Array(8);
  crypto.getRandomValues(randomBuffer);
  const nonceHex = Array.from(randomBuffer).map(b => b.toString(16).padStart(2, '0')).join('');

  // Use the robust delimiter |#|
  const payload = `${ip}|#|${timestamp}|#|${nonceHex}`;

  const key = await getCryptoKey(env.JWT_SECRET);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));

  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Encode the entire structure
  const token = btoa(`${payload}|#|${signatureHex}`);
  return json({ token });
}

// 2. POST: Validate the token
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'Ogiltig JSON'); }

  const { id, post, name, email, comment, token } = body;
  if (!id || !post || !name || !email || !comment || !token) {
    return err(400, 'Saknade fält eller token');
  }

  try {
    const decoded = atob(token);
    
    // Split using the robust, non-colliding delimiter
    const parts = decoded.split('|#|');
    if (parts.length !== 4) return err(403, 'Felaktigt tokenformat');

    const [ip, timestampStr, nonceHex, signatureHex] = parts;
    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

    // Verify IP immediately
    if (ip !== clientIp) return err(403, 'IP-adressen matchar inte');

    // Cryptographic validation
    const payloadBytes = new TextEncoder().encode(`${ip}|#|${timestampStr}|#|${nonceHex}`);
    const signatureBytes = new Uint8Array(signatureHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const key = await getCryptoKey(env.JWT_SECRET || env.TURNSTILE_SECRET);
    const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);

    if (!isValid) return err(403, 'Ogiltig verifieringstoken');

    // Time lock check
    const elapsed = Date.now() - parseInt(timestampStr, 10);
    if (elapsed < 6000) return err(403, 'För snabb interaktion.');
    if (elapsed > 900000) return err(403, 'Token har löpt ut.');

  } catch (e) {
    return err(403, `Verifieringsfel: ${e.message}`);
  }

  // Insert logic here...
  return ok();
}

// Helper functions (keep these as they are)
function ok() { return json({ ok: true }); }
function err(s, msg) { return json({ error: msg }, s); }
function json(body, s = 200) {
  return new Response(JSON.stringify(body), { 
    status: s, 
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } 
  });
}