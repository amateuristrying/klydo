const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reply = (error, status) => Response.json({ error }, { status });

export async function onRequestPost({ request, env }) {
  if (!env.SIGNUPS) return reply("Sign-ups are not configured", 503);

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!name || name.length > 100) return reply("Invalid name", 400);
  if (email.length > 254 || !EMAIL.test(email)) return reply("Invalid email", 400);

  await env.SIGNUPS.put(email, JSON.stringify({ name, email, at: new Date().toISOString() }));
  return Response.json({ ok: true }, { status: 201 });
}
