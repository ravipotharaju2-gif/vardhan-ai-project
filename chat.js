// Vardhan AI — public no-login Gemini endpoint for Netlify Functions.
// Required: GEMINI_API_KEY. Optional: GEMINI_MODEL, GEMINI_IMAGE_MODEL

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const reply = (statusCode, payload) => ({
  statusCode,
  headers: { ...JSON_HEADERS, "cache-control": "no-store" },
  body: JSON.stringify(payload)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST only" });
  const rawBody = event.body || "";
  if (Buffer.byteLength(rawBody, "utf8") > 5_000_000) {
    return reply(413, { error: "Request too large. Use smaller images or shorter documents." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reply(500, { error: "Server setup incomplete: add GEMINI_API_KEY in Netlify environment variables." });

    const body = JSON.parse(rawBody || "{}");
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const mode = ["smart", "deep", "doc", "image", "search"].includes(body.mode) ? body.mode : "smart";
    if (!prompt) return reply(400, { error: "Please enter a message." });
    if (prompt.length > 180_000) return reply(413, { error: "Prompt too long. Shorten the prompt or attached documents." });

    const images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
    const parts = [];
    for (const image of images) {
      if (!image || typeof image.data !== "string") continue;
      const mimeType = String(image.type || "").toLowerCase();
      if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) continue;
      if (image.data.length > 1_300_000) continue;
      parts.push({ inlineData: { mimeType, data: image.data } });
    }
    parts.push({ text: prompt });

    const isImageMode = mode === "image";
    const model = isImageMode
      ? (process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image")
      : (process.env.GEMINI_MODEL || "gemini-3.8-flash");

    const generationConfig = {
      maxOutputTokens: isImageMode ? 2048 : Math.max(512, Math.min(Number(body.max) || 3000, 8192))
    };
    if (isImageMode) {
      generationConfig.responseModalities = ["TEXT", "IMAGE"];
      generationConfig.imageConfig = { aspectRatio: "16:9", imageSize: "1K" };
    } else if (mode === "deep") {
      generationConfig.thinkingConfig = { thinkingLevel: "HIGH" };
    } else {
      generationConfig.thinkingConfig = { thinkingLevel: "MEDIUM" };
    }

    const requestBody = {
      contents: [{ role: "user", parts }],
      generationConfig
    };
    if (mode === "search") requestBody.tools = [{ google_search: {} }];

    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(requestBody)
      }
    );
    const result = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      const message = result?.error?.message || "Gemini API request failed.";
      const safeMessage = apiResponse.status === 429
        ? "Gemini rate limit or quota reached. Wait and try again, or check your Google AI Studio usage."
        : apiResponse.status === 403
          ? "Gemini denied this request. Check API key permissions, model access and billing settings."
          : message;
      return reply(apiResponse.status, { error: safeMessage });
    }

    const outputParts = result?.candidates?.[0]?.content?.parts || [];
    const answer = outputParts
      .filter(part => typeof part.text === "string" && !part.thought)
      .map(part => part.text)
      .join("\n");
    const generatedImage = outputParts.find(part => part.inlineData?.data && part.inlineData?.mimeType);
    const chunks = result?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map(chunk => chunk.web)
      .filter(web => web?.uri && /^https:\/\//i.test(web.uri))
      .map(web => ({ title: web.title || web.uri, uri: web.uri }))
      .filter((item, index, all) => all.findIndex(x => x.uri === item.uri) === index)
      .slice(0, 8);

    if (isImageMode && generatedImage) {
      return reply(200, {
        text: answer || "Your image is ready.",
        image: { mimeType: generatedImage.inlineData.mimeType, data: generatedImage.inlineData.data }
      });
    }
    if (!answer) return reply(502, { error: "Gemini returned no text. Try again or switch modes." });
    return reply(200, { text: answer, sources });
  } catch (error) {
    return reply(500, { error: error?.message || "Unexpected server error. Please try again." });
  }
};
