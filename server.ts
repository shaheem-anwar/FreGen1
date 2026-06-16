import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
app.use(express.json({ limit: "15mb" }));

const PORT = 3000;

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// API endpoint to generate high-quality image using NVIDIA Stable Diffusion XL API or fallback to Pollinations AI
app.post("/api/generate-image", async (req, res) => {
  const { prompt, nvidiaKey } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const keyToUse = nvidiaKey || process.env.NVIDIA_API_KEY || "";

  if (keyToUse.trim() !== "") {
    try {
      console.log("Attempting NVIDIA NIM Stable Diffusion XL API...");
      const response = await fetch("https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${keyToUse.trim()}`,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
          negative_prompt: "blurry, low quality, distorted, extra limbs, bad anatomy, text, watermark, signature",
          steps: 30,
          cfg_scale: 7,
          seed: Math.floor(Math.random() * 1000000),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.artifacts && data.artifacts[0] && data.artifacts[0].base64) {
          const base64Str = data.artifacts[0].base64;
          return res.json({
            image: `data:image/png;base64,${base64Str}`,
            source: "nvidia_nim",
            prompt: prompt,
          });
        }
      } else {
        const errorText = await response.text();
        console.warn("NVIDIA NIM Error (status logic):", errorText);
        // Fail over to pollinations
      }
    } catch (e: any) {
      console.warn("NVIDIA NIM Exception, falling back to Pollinations AI:", e.message);
    }
  }

  // Fallback / standard free image generation with pollinations.ai (Vite-friendly / fully free)
  try {
    console.log("Generating image utilizing Pollinations free API proxy...");
    const width = 1024;
    const height = 1024;
    const seed = Math.floor(Math.random() * 999999);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

    const imageResponse = await fetch(pollinationsUrl);
    if (!imageResponse.ok) {
      throw new Error("Failed to retrieve image from Pollinations API");
    }

    const buffer = await imageResponse.arrayBuffer();
    const base64Str = Buffer.from(buffer).toString("base64");

    return res.json({
      image: `data:image/png;base64,${base64Str}`,
      source: "pollinations_ai",
      prompt: prompt,
    });
  } catch (err: any) {
    console.error("Image generation failed:", err);
    return res.status(500).json({ error: "Failed to generate image: " + err.message });
  }
});

// Sound / SFX Generation Endpoint (using server-side Gemini system instructions to write procedural audio synth)
app.post("/api/generate-audio", async (req, res) => {
  const { prompt, sfxDescription } = req.body;

  if (!prompt && !sfxDescription) {
    return res.status(400).json({ error: "Prompt or SFX Description is required" });
  }

  try {
    console.log("Synthesizing procedural audio instructions using Gemini API...");
    const context = `Generate a Web Audio API procedural synthesis recipe that implements a sound effect for this description: "${sfxDescription || prompt}".
The design should be expressive, immersive, and fit the mood. Return a JSON structure exactly matching the schema below.
DO NOT return any surrounding markdown like \`\`\`json. Return only raw json.

Schema format:
{
  "soundName": "string representing name",
  "description": "brief outline of sound architecture",
  "duration": number (duration in seconds, minimum 0.5, maximum 4.0),
  "oscillators": [
    {
      "type": "sine" | "square" | "sawtooth" | "triangle",
      "startFreq": number (Hertz, e.g. 150),
      "endFreq": number (Hertz - can sweep up or down, e.g. 800),
      "detune": number,
      "startTime": number (offset in seconds to start, e.g. 0.0),
      "duration": number (how long it runs, e.g. 1.5),
      "gainStart": number (0.0 to 1.0, e.g. 0.5),
      "gainEnd": number (0.0 to 1.0, e.g. 0.0)
    }
  ],
  "noise": {
    "type": "white" | "pink" | null,
    "startTime": number,
    "duration": number,
    "gainStart": number,
    "gainEnd": number,
    "filterType": "lowpass" | "highpass" | "bandpass" | null,
    "filterFreqStart": number,
    "filterFreqEnd": number
  },
  "vibrato": {
    "freq": number,
    "depth": number
  }
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: context,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            soundName: { type: Type.STRING },
            description: { type: Type.STRING },
            duration: { type: Type.NUMBER },
            oscillators: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  startFreq: { type: Type.NUMBER },
                  endFreq: { type: Type.NUMBER },
                  detune: { type: Type.NUMBER },
                  startTime: { type: Type.NUMBER },
                  duration: { type: Type.NUMBER },
                  gainStart: { type: Type.NUMBER },
                  gainEnd: { type: Type.NUMBER },
                },
                required: ["type", "startFreq", "endFreq", "startTime", "duration", "gainStart", "gainEnd"],
              },
            },
            noise: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                startTime: { type: Type.NUMBER },
                duration: { type: Type.NUMBER },
                gainStart: { type: Type.NUMBER },
                gainEnd: { type: Type.NUMBER },
                filterType: { type: Type.STRING },
                filterFreqStart: { type: Type.NUMBER },
                filterFreqEnd: { type: Type.NUMBER },
              },
            },
            vibrato: {
              type: Type.OBJECT,
              properties: {
                freq: { type: Type.NUMBER },
                depth: { type: Type.NUMBER },
              },
            },
          },
          required: ["soundName", "description", "duration"],
        },
      },
    });

    const jsonText = response.text?.trim() || "{}";
    const audioRecipe = JSON.parse(jsonText);

    return res.json({ recipe: audioRecipe });
  } catch (err: any) {
    console.error("Audio sequence generation failed:", err);
    return res.status(500).json({ error: "Failed to generate sound parameters: " + err.message });
  }
});

// Setup development server or build-time static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
