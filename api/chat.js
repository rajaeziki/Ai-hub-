// Vercel serverless function: POST /api/chat
// Powers the AI Hub website chatbot with Claude.
// Requires the ANTHROPIC_API_KEY environment variable (Vercel > Project > Settings > Environment Variables).
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const SYSTEM = `You are the AI Hub Assistant, the chat assistant on the website of AI Hub.

About AI Hub:
AI Hub is a startup that supports small businesses and startups in their digital transformation through artificial intelligence and task automation. Mission: make AI accessible and effective for all businesses, so they can focus on what truly matters: their development and their customers.

Services:
- Process optimization: automating repetitive operational work (invoice processing, data entry, scheduling, document sorting, email triage) to save time.
- Chatbots & marketing automation: chatbots that answer customers 24/7 on a website or WhatsApp, automated email campaigns, lead follow-up, social media scheduling.
- Analytics & decision tools: dashboards, automated reports, forecasting and customer insights to boost growth.

How it works: 1) free discovery call, 2) AI audit & roadmap, 3) build & integrate with the client's existing tools, 4) measure & improve.
Clients need no technical skills. Contact: the form on this page ("Book my free audit") or email rajaezikii@gmail.com.

How to answer:
- Reply in the visitor's language (English, French, Arabic and Darija are all common).
- Keep answers short: 2 to 4 sentences of plain text, no markdown headings or bold. A short numbered list is fine for steps.
- Be warm, concrete and professional. When the visitor mentions their type of business, give examples that fit it.
- Only state facts listed above. Do not invent prices, delivery times, client names, results or guarantees. For pricing, explain that it depends on the project and that the free audit gives a clear proposal.
- When the visitor shows interest, invite them to book the free audit using the form on this page.
- If a question is unrelated to AI Hub or to using AI in a business, answer briefly and steer back to how AI Hub can help.
- Latency-sensitive; begin your visible answer immediately.`;

const REFUSAL_REPLY =
  "Sorry, I can't help with that. I'm happy to answer any question about AI Hub and how AI can help your business.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "The AI chat is not configured yet." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // Keep only well-formed recent turns, capped in length, starting with a user turn.
  const messages = (Array.isArray(body?.messages) ? body.messages : [])
    .filter(m => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Send at least one user message." });
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return res.status(200).json({ reply: REFUSAL_REPLY });
    }
    const reply = response.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("")
      .trim();
    return res.status(200).json({ reply: reply || REFUSAL_REPLY });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "The assistant is busy. Please try again in a moment." });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      return res.status(502).json({ error: "The assistant is temporarily unavailable." });
    }
    console.error("Chat handler error", err);
    return res.status(500).json({ error: "Something went wrong." });
  }
}
