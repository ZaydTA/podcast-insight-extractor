const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "1mb" }));

let groq;
function getGroq() {
  if (!groq) groq = new Groq();
  return groq;
}

const SYSTEM_PROMPT = `You are an expert podcast analyst. Given a podcast transcript, produce a structured brief with exactly these sections:

## Core Thesis
2-3 sentences summarizing the main argument or central idea of the conversation.

## Mental Models & Frameworks
Identify any conceptual tools, frameworks, or ways of thinking introduced or discussed. For each one, give the name/label and a 1-2 sentence explanation of what it is and how it's used.

## Contrarian Takes
List non-obvious, counterintuitive, or against-the-grain points made. These are ideas that challenge conventional wisdom or reframe common assumptions. Skip this section if there are none.

## Tactical Takeaways
List specific, actionable things a listener could actually do based on the conversation. Be concrete — not vague advice, but real steps.

Keep it concise. No fluff. Use bullet points within sections where appropriate.`;

app.post("/api/extract", async (req, res) => {
  const { transcript } = req.body;

  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: "Transcript is required." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const stream = await getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
      max_tokens: 4096,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();

    req.on("close", () => {
      stream.controller?.abort();
    });
  } catch (err) {
    console.error("API error:", err.message);
    res.write(
      `data: ${JSON.stringify({ type: "error", message: "An error occurred during extraction." })}\n\n`
    );
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
