// TODO: Session 3 — Vercel Edge Function for Anthropic API proxy
// export const config = { runtime: 'edge' };
//
// export default async function handler(req) {
//   const { messages, model } = await req.json();
//   // Validate user auth token
//   // Check user plan (free users can't access AI chat)
//   // Proxy to Anthropic API
// }

export default function handler(req, res) {
  res.status(501).json({ error: 'Not implemented — Session 3' });
}
