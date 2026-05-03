const ALLOWED = new Set(["openai", "groq", "gemini"]);

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  const { provider, prompt } = req.body ?? {};
  if (!ALLOWED.has(provider) || typeof prompt !== "string") {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    let raw = "";

    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey)
        return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful webpage summarizer. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) return res.status(r.status).json({ error: "Upstream error" });
      const data = await r.json();
      raw = data.choices?.[0]?.message?.content ?? "";
    } else if (provider === "groq") {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey)
        return res.status(500).json({ error: "Missing GROQ_API_KEY" });

      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful webpage summarizer. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 800,
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) return res.status(r.status).json({ error: "Upstream error" });
      const data = await r.json();
      raw = data.choices?.[0]?.message?.content ?? "";
    } else {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey)
        return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 800,
              responseMimeType: "application/json",
            },
          }),
        },
      );
      if (!r.ok) return res.status(r.status).json({ error: "Upstream error" });
      const data = await r.json();
      raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    return res.status(200).json({ raw });
  } catch {
    return res.status(500).json({ error: "Proxy error" });
  }
}

