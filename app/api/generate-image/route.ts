import { type NextRequest, NextResponse } from "next/server";
import Together from "together-ai";

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { prompt, width, height } = await request.json();

    console.log("[v0] Received request:", { prompt, width, height });

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    if (!process.env.TOGETHER_API_KEY) {
      return NextResponse.json(
        { error: "Together AI API key not configured" },
        { status: 500 }
      );
    }

    const response = await together.images.create({
      model: "black-forest-labs/FLUX.1-schnell-Free",
      prompt,
      width: Number.parseInt(width) || 768,
      height: Number.parseInt(height) || 768,
      n: 1,
    });

    console.log("[v0] API response received:", response);

    if (
      !response.data ||
      !response.data[0] ||
      (!("b64_json" in response.data[0]) && !("url" in response.data[0]))
    ) {
      console.log("[v0] Invalid response structure:", response);
      return NextResponse.json(
        { error: "Failed to generate image" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imageData:
        "b64_json" in response.data[0]
          ? response.data[0].b64_json
          : response.data[0].url,
    });
  } catch (error) {
    console.error("[v0] Image generation error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate image",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
