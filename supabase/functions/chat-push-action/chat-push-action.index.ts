import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHAT_PUSH_ACTION_SECRET = Deno.env.get('CHAT_PUSH_ACTION_SECRET')!;

const SEND_MESSAGE_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/send-message`;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type ActionTokenPayload = {
  v: number;
  sub: string;
  room_id: number;
  room_seq?: number | null;
  room_type?: string | null;
  message_uid?: string | null;
  sender_id?: string | null;
  exp: number;
  act: 'read' | 'reply';
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function signBase64Url(input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(CHAT_PUSH_ACTION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function verifyToken(token: string): Promise<ActionTokenPayload> {
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) {
    throw new Error('invalid token format');
  }

  const expected = await signBase64Url(payloadPart);
  if (!timingSafeEqual(expected, signaturePart)) {
    throw new Error('invalid token signature');
  }

  const decoded = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
  const payload = JSON.parse(decoded) as ActionTokenPayload;

  if (!payload?.sub || !payload?.room_id || !payload?.exp || !payload?.act) {
    throw new Error('invalid token payload');
  }
  if (Math.floor(Date.now() / 1000) >= Number(payload.exp)) {
    throw new Error('token expired');
  }

  return payload;
}

async function handleRead(payload: ActionTokenPayload) {
  const roomId = Number(payload.room_id);
  const roomSeq = Number(payload.room_seq ?? 0);
  if (!Number.isFinite(roomId) || roomId <= 0 || !Number.isFinite(roomSeq) || roomSeq <= 0) {
    throw new Error('invalid read payload');
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('chat_members')
    .select('last_read_seq')
    .eq('room_id', roomId)
    .eq('user_id', payload.sub)
    .maybeSingle();

  if (fetchError) throw new Error(`read fetch failed: ${fetchError.message}`);

  const currentSeq = Number(existing?.last_read_seq ?? 0) || 0;
  if (currentSeq >= roomSeq) {
    return { updated: false, roomId, roomSeq };
  }

  const { error: updateError } = await supabaseAdmin
    .from('chat_members')
    .update({
      last_read_seq: roomSeq,
      last_read_at: new Date().toISOString(),
    })
    .eq('room_id', roomId)
    .eq('user_id', payload.sub)
    .eq('active', true)
    .is('left_at', null);

  if (updateError) throw new Error(`read update failed: ${updateError.message}`);

  return { updated: true, roomId, roomSeq };
}

async function handleReply(payload: ActionTokenPayload, replyText: string) {
  const text = normalizeString(replyText);
  if (!text) throw new Error('reply text required');

  const response = await fetch(SEND_MESSAGE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'x-push-action': '1',
    },
    body: JSON.stringify({
      room_id: payload.room_id,
      sender_id: payload.sub,
      kind: 'text',
      text,
      content: text,
      original: { text },
      client_msg_id: `push_reply_${payload.message_uid ?? 'msg'}_${Date.now()}`,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`send-message failed: ${body}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    return { ok: true };
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const token = normalizeString(body?.token);
    if (!token) return json(400, { error: 'token required' });

    const payload = await verifyToken(token);

    if (payload.act === 'read') {
      const result = await handleRead(payload);
      return json(200, { ok: true, action: 'read', result });
    }

    if (payload.act === 'reply') {
      const replyText = normalizeString(body?.replyText || body?.text || body?.message || body?.body);
      const result = await handleReply(payload, replyText);
      return json(200, { ok: true, action: 'reply', result });
    }

    return json(400, { error: 'unsupported action' });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : String(error) });
  }
});
