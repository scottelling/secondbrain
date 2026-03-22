// Vercel Edge Function — Anthropic API proxy for AI chat
export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages, model } = body;

  // Validate messages
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Enforce conversation length limit
  if (messages.length > 50) {
    return new Response(JSON.stringify({ error: 'Conversation too long (max 50 messages)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // TODO: Validate user auth token from request headers
  // const authHeader = req.headers.get('Authorization');
  // Verify Supabase JWT, get user ID
  // if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // TODO: Check user plan — free users can't access AI chat
  // const profile = await supabase.from('profiles').select('plan').eq('id', userId).single();
  // if (profile.data?.plan !== 'pro') return Response.json({ error: 'Upgrade to Pro' }, { status: 403 });

  // TODO: Track token usage
  // await supabase.from('usage').upsert({ user_id: userId, month: currentMonth, tokens_used: ... });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: 'You are a helpful thinking partner embedded in an outliner app called Second Brain. Keep responses concise and actionable. Use short paragraphs, not bullet lists. The user may send you notes, ideas, tasks, or research items from their outliner for you to help with.',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: data.error?.message || `Anthropic API error: ${response.status}`,
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Proxy error: ${err.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
