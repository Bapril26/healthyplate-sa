/**
 * HealthyPlate SA – food photo scan server (Cloudflare Worker)
 *
 * Keeps the Anthropic API key on the server instead of inside the app.
 * Deploy (free tier is fine):
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker → paste this file → Deploy
 *   2. Worker → Settings → Variables → add a SECRET named ANTHROPIC_API_KEY
 *   3. Copy the worker URL (https://<name>.<you>.workers.dev) into the app:
 *      Profile → Photo scanner → "Fusion Labs scan server", then tap Test connection.
 *
 * Request:  POST { image: "<base64 jpeg>", media_type: "image/jpeg" }   or   POST { ping: true }
 * Response: the scan result JSON (same shape the app expects), or { error: "..." } with a status code.
 */
const MODEL = 'claude-sonnet-5-5';
const MAX_IMAGE_BASE64 = 6 * 1024 * 1024; // ~4.5 MB photo

const PROMPT = 'You are a nutrition estimation assistant inside a South African healthy-eating app. Look at this photo of food and estimate what is on the plate. Recognise South African foods (e.g. pap, boerewors, chakalaka, bunny chow, vetkoek, biltong, bobotie, samoosas, gatsby, koeksisters) as well as general foods. Estimate realistic portion weights and include likely hidden cooking oil and sauces. Respond with ONLY a JSON object, no other text, in exactly this shape: {"is_food": true, "meal_name": "short name", "items": [{"name": "food item", "portion": "e.g. 1 cup (180 g)", "grams": 180, "kcal": 230, "protein_g": 5, "carbs_g": 45, "fat_g": 2}], "total": {"kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}, "confidence": "low|medium|high", "possible_allergens": ["dairy","egg","gluten","peanuts","nuts","soy","fish","shellfish","sesame"], "notes": "one short sentence on what most affects accuracy"}. Only list allergens that are plausibly present. If the image does not contain food, return {"is_food": false, "items": []}.';

const CORS = {
  'Access-Control-Allow-Origin': 'https://appassets.androidplatform.net',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'The scan server has no ANTHROPIC_API_KEY secret set.' }, 500);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    if (body.ping) return json({ ok: true });

    const image = typeof body.image === 'string' ? body.image : '';
    const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body.media_type) ? body.media_type : 'image/jpeg';
    if (!image) return json({ error: 'No photo was sent.' }, 400);
    if (image.length > MAX_IMAGE_BASE64) return json({ error: 'The photo is too large.' }, 413);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.MODEL || MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: PROMPT },
        ] }],
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return json({ error: (data && data.error && data.error.message) || 'AI service error' }, res.status);

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: 'The AI reply could not be read.' }, 502);
    try { return json(JSON.parse(match[0])); } catch { return json({ error: 'The AI reply could not be read.' }, 502); }
  },
};
