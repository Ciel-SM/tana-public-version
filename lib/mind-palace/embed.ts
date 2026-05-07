// Gemini Embedding 2 wrapper for multimodal embedding
// Accepts up to 6 images + text per request.

import type { GoogleGenAI } from '@google/genai';

const EMBED_MODEL = 'gemini-embedding-2-preview';

interface EmbedInput {
  images: Array<{ base64: string; mimeType: string }>;
  text?: string;
}

export async function embedMultimodal(
  ai: GoogleGenAI,
  input: EmbedInput,
): Promise<Float32Array> {
  const contents: any[] = [];

  for (const img of input.images.slice(0, 6)) {
    contents.push({
      inlineData: { mimeType: img.mimeType, data: img.base64 },
    });
  }

  if (input.text) {
    contents.push({ text: input.text });
  }

  // If we have images and text, keep total images at 5 max to leave room
  if (input.text && contents.length > 6) {
    // Remove excess images from the front (keep text at end)
    while (contents.length > 6) {
      contents.splice(0, 1);
    }
  }

  const result = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents,
  });

  const values = (result as any).embeddings?.[0]?.values
    ?? (result as any).embedding?.values
    ?? [];

  return new Float32Array(values);
}

export async function embedText(
  ai: GoogleGenAI,
  text: string,
): Promise<Float32Array> {
  const result = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: text,
  });

  const values = (result as any).embeddings?.[0]?.values
    ?? (result as any).embedding?.values
    ?? [];

  return new Float32Array(values);
}

export { EMBED_MODEL };
