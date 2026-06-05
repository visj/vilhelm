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

// 1. GET: Issues a signed cryptographic token when the comment modal opens
export async function onRequestGet({ request, env }) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const timestamp = Date.now();
  const payload = `${ip}:${timestamp}`;

  const key = await getCryptoKey(env.JWT_SECRET);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));

  // Convert signature to hex string
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // The final token is a simple web-safe layout: payload.signature
  const token = btoa(`${payload}.${signature}`);
  return json({ token });
}

// 2. POST: Processes the comment submission and validates the token
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'Ogiltig JSON'); }

  const { id = '', parent_id = '', post = '', name = '', email = '', comment = '', token = '' } = body;
  if (!id.trim() || !post.trim() || !name.trim() || !email.trim() || !comment.trim()) {
    return err(400, 'Ogiltiga fält');
  }

  // Cryptographic & Time-Lock Validation
  if (!token) return err(403, 'Verifiering saknas');

  try {
    const decoded = atob(token);
    const [ip, timestampStr, signature] = decoded.split(/[:.]/);
    const timestamp = parseInt(timestampStr, 10);
    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

    // Verify signature integrity
    const payload = `${ip}:${timestampStr}`;
    const key = await getCryptoKey(env.JWT_SECRET);
    const expectedBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const expectedSignature = Array.from(new Uint8Array(expectedBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (signature !== expectedSignature) return err(403, 'Ogiltig verifieringstoken');
    if (ip !== clientIp) return err(403, 'IP-adressen matchar inte');

    // Enforce the 8-second time lock rule
    const elapsed = Date.now() - timestamp;
    if (elapsed < 8000) return err(403, 'Du interagerade för snabbt. Vänta några sekunder.');
    if (elapsed > 900000) return err(403, 'Token har löpt ut. Stäng modalen och försök igen.');

  } catch (e) {
    return err(403, 'Verifieringen misslyckades');
  }

  // Insert verified comment into D1
  await env.DB.prepare(
    'INSERT INTO comments (id, parent_id, post, name, email, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id.trim(), parent_id.trim(), post.trim(), name.trim(), email.trim(), comment.trim(), new Date().toISOString()).run();

  return ok();
}

function ok() { return json({ ok: true }); }
function err(s, msg) { return json({ error: msg }, s); }
function json(body, s = 200) {
  return new Response(JSON.stringify(body), { status: s, headers: { 'Content-Type': 'application/json' } });
}