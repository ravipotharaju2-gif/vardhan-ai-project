// Vardhan AI — Netlify Gemini API

const reply = (statusCode, payload) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  },
  body: JSON.stringify(payload)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "POST only" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return reply(500, {
        error: "Please configure GEMINI_API_KEY in Netlify."
      });
    }

    const body = JSON.parse(event.body || "{}");
    const prompt = typeof body.prompt === "string"
      ? body.prompt.trim()
      : "";

    if (!prompt) {
      return reply(400, { error: "Please enter a message." });
    }

    const mode = ["smart", "deep", "doc", "image", "search"]
      .includes(body.mode) ? body.mode : "smart";

    const parts = [];

    if (Array.isArray(body.images)) {
      for (const img of body.images.slice(0, 3)) {
        if (
          img &&
          typeof img.data === "string" &&
          ["image/png", "image/jpeg", "image/webp"].includes(img.type)
        ) {
          parts.push({
            inlineData: {
              mimeType: img.type,
              data: img.data
            }
          });
        }
      }
    }

    parts.push({ text: prompt });

    const imageMode = mode === "image";
    const model = imageMode
      ? (process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image")
      : (process.env.GEMINI_MODEL || "gemini-3.8-flash");

    const generationConfig = {
      maxOutputTokens: imageMode ? 2048 : 4096
    };

    if (imageMode) {
      generationConfig.responseModalities = ["TEXT", "IMAGE"];
    }

    const requestBody = {
      contents: [{ role: "user", parts }],
      generationConfig
    };

    if (mode === "search") {
      requestBody.tools = [{ google_search: {} }];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(requestBody)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return reply(response.status, {
        error: result?.error?.message || "Gemini API request failed."
      });
    }

    const output = result?.candidates?.[0]?.content?.parts || [];
    const answer = output
      .filter(p => typeof p.text === "string" && !p.thought)
      .map(p => p.text)
      .join("\n");

    const generatedImage = output.find(
      p => p.inlineData?.data && p.inlineData?.mimeType
    );

    if (imageMode && generatedImage) {
      return reply(200, {
        text: answer || "Your image is ready.",
        image: {
          mimeType: generatedImage.inlineData.mimeType,
          data: generatedImage.inlineData.data
        }
      });
    }

    if (!answer) {
      return reply(502, { error: "Gemini returned no text. Please try again." });
    }

    return reply(200, { text: answer });
  } catch (error) {
    return reply(500, {
      error: error.message || "Unexpected server error."
    });
  }
};
