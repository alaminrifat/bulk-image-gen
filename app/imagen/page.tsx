"use client";

import type React from "react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  Download,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import ApiKeyModal from "@/components/ApiKeyModal";

// Google Imagen API
import { GoogleGenAI, PersonGeneration } from "@google/genai";

const ASPECT_RATIO_OPTIONS = [
  { label: "1:1 (Square)", value: "1:1" },
  { label: "9:16 (Portrait)", value: "9:16" },
  { label: "16:9 (Landscape)", value: "16:9" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
];

const SAMPLE_JSON = `[
	"A futuristic data visualization hologram emerging from a tablet held by a businesswoman in a sleek, minimalist office, neon blue and purple light, cyberpunk aesthetic.",
	"A top-down shot (flat lay) of a modern home office setup: laptop, notebook, smartphone, glasses, and a cup of coffee on a wooden desk, minimalist, clean aesthetic, natural light.",
	"A diverse team in a high-tech control room with massive, futuristic screens displaying complex analytics, they are pointing and discussing, cinematic lighting."
]`;

interface PromptData {
  prompt: string;
  index: number;
}

interface GeneratedImage {
  prompt: string;
  imageData: string;
  index: number;
}

export default function ImagenBatchGenerator() {
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [prompts, setPrompts] = useState<PromptData[]>([]);
  const [manualPrompts, setManualPrompts] = useState<string[]>([""]);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // API key modal logic (for Gemini/Imagen)
  const [apiKey, setApiKey] = useState<string | null>(null);
  const handleApiKeySet = (key: string) => setApiKey(key);

  // File upload and manual prompt logic (same as main page)
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      setError("Please upload a JSON file");
      return;
    }
    setJsonFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const jsonData = JSON.parse(text);
        if (!Array.isArray(jsonData)) {
          setError("JSON file must contain an array of prompts");
          return;
        }
        const promptData: PromptData[] = jsonData.map((prompt, index) => ({
          prompt: String(prompt).trim(),
          index,
        }));
        setPrompts(promptData);
      } catch (err) {
        setError("Invalid JSON file format");
      }
    };
    reader.readAsText(file);
  };

  const addManualPrompt = () => setManualPrompts([...manualPrompts, ""]);
  const removeManualPrompt = (index: number) => {
    if (manualPrompts.length > 1) {
      setManualPrompts(manualPrompts.filter((_, i) => i !== index));
    }
  };
  const updateManualPrompt = (index: number, value: string) => {
    const updated = [...manualPrompts];
    updated[index] = value;
    setManualPrompts(updated);
  };
  const useManualPrompts = () => {
    const validPrompts = manualPrompts.filter((p) => p.trim());
    if (validPrompts.length === 0) {
      setError("Please add at least one prompt");
      return;
    }
    const promptData: PromptData[] = validPrompts.map((prompt, index) => ({
      prompt: prompt.trim(),
      index,
    }));
    setPrompts(promptData);
    setError(null);
  };

  // Imagen API call
  const generateImage = async (
    prompt: string,
    aspectRatio: string
  ): Promise<string> => {
    if (!apiKey) throw new Error("API key is required");
    // Map aspect ratio to Imagen API values
    const aspectMap: Record<string, string> = {
      "1:1": "1:1",
      "9:16": "9:16",
      "16:9": "16:9",
      "4:3": "4:3",
      "3:4": "3:4",
    };
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-001",
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: aspectMap[aspectRatio] || "16:9",
      },
    });

    if (
      !response?.generatedImages ||
      !response.generatedImages[0]?.image?.imageBytes
    ) {
      throw new Error("No image data returned from Imagen API");
    }
    return response.generatedImages[0].image.imageBytes; // base64 JPEG
  };

  const startProcessing = async () => {
    if (prompts.length === 0) {
      setError(
        "Please upload a JSON file with prompts or add manual prompts first"
      );
      return;
    }
    setIsProcessing(true);
    setIsPaused(false);
    setError(null);
    abortControllerRef.current = new AbortController();
    // Remove duplicate prompts
    const seen = new Set<string>();
    const uniquePrompts = prompts.filter((p) => {
      const key = p.prompt.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setTotalToProcess(uniquePrompts.length);
    try {
      for (let i = currentIndex; i < uniquePrompts.length; i++) {
        if (isPaused || abortControllerRef.current?.signal.aborted) break;
        setCurrentIndex(i + 1);
        setError(null);
        try {
          setIsProcessing(true);
          const imageData = await generateImage(
            uniquePrompts[i].prompt,
            aspectRatio
          );
          const newImage: GeneratedImage = {
            prompt: uniquePrompts[i].prompt,
            imageData,
            index: i,
          };
          setGeneratedImages((prev) => [...prev, newImage]);
          downloadImage(newImage);
        } catch (err) {
          setError(
            `Failed to generate image for prompt ${i + 1}: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(`Processing failed: ${err.message}`);
      }
    } finally {
      setIsProcessing(false);
      setCurrentIndex(0);
      setTotalToProcess(0);
    }
  };

  const pauseProcessing = () => {
    setIsPaused(true);
    abortControllerRef.current?.abort();
  };
  const resetProcessing = () => {
    setIsProcessing(false);
    setIsPaused(false);
    setCurrentIndex(0);
    setGeneratedImages([]);
    setError(null);
    abortControllerRef.current?.abort();
  };
  const downloadImage = (image: GeneratedImage) => {
    const link = document.createElement("a");
    link.href = `data:image/jpeg;base64,${image.imageData}`;
    link.download = `imagen-image-${image.index + 1}.jpeg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const downloadAllImages = () => {
    generatedImages.forEach((image) => {
      downloadImage(image);
    });
  };
  const progress =
    totalToProcess > 0 ? (currentIndex / totalToProcess) * 100 : 0;

  return (
    <>
      <ApiKeyModal onApiKeySet={handleApiKeySet} service="imagen" />
      {apiKey && (
        <div className="min-h-screen bg-background p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold">Imagen Batch Generator</h1>
              <p className="text-muted-foreground">
                Upload a JSON file with prompts or add them manually to generate
                images using Google Imagen
              </p>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Upload JSON File</CardTitle>
                <CardDescription>
                  Upload a JSON file containing an array of prompts for image
                  generation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Browse
                  </Button>
                </div>
                {jsonFile && (
                  <div className="text-sm text-muted-foreground">
                    Loaded: {jsonFile.name} ({prompts.length} prompts)
                  </div>
                )}
                <div className="mt-4">
                  <Label className="text-sm font-medium">
                    Sample JSON format:
                  </Label>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-sm overflow-x-auto">
                    {SAMPLE_JSON}
                  </pre>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Manual Prompts</CardTitle>
                <CardDescription>
                  Add prompts manually instead of uploading a file
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {manualPrompts.map((prompt, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Textarea
                      placeholder={`Enter prompt ${index + 1}...`}
                      value={prompt}
                      onChange={(e) =>
                        updateManualPrompt(index, e.target.value)
                      }
                      className="flex-1 min-h-[60px]"
                    />
                    <div className="flex flex-col gap-1">
                      {index === manualPrompts.length - 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={addManualPrompt}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                      {manualPrompts.length > 1 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeManualPrompt(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button onClick={useManualPrompts} className="w-full">
                  Use Manual Prompts (
                  {manualPrompts.filter((p) => p.trim()).length} valid)
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Generation Settings</CardTitle>
                <CardDescription>
                  Configure the image generation parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="aspectRatio">Aspect Ratio</Label>
                    <Select value={aspectRatio} onValueChange={setAspectRatio}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASPECT_RATIO_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Model Information</Label>
                    <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                      Using Imagen 4.0 model
                      <br />
                      High quality, photorealistic images
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Processing</CardTitle>
                <CardDescription>
                  {isProcessing
                    ? `Processing prompt ${currentIndex} of ${totalToProcess}`
                    : `Ready to process ${prompts.length} prompts`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isProcessing && (
                  <div className="flex items-center justify-center py-4">
                    <Spinner className="h-10 w-10 mr-3" />
                    <span className="text-blue-600 font-medium">
                      Generating images, please wait...
                    </span>
                  </div>
                )}
                {prompts.length > 0 && (
                  <Progress value={progress} className="w-full" />
                )}
                <div className="flex items-center gap-2">
                  {!isProcessing ? (
                    <Button
                      onClick={startProcessing}
                      disabled={prompts.length === 0}
                      className="flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      Start Processing
                    </Button>
                  ) : (
                    <Button
                      onClick={pauseProcessing}
                      variant="secondary"
                      className="flex items-center gap-2"
                    >
                      <Pause className="w-4 h-4" />
                      Pause
                    </Button>
                  )}
                  <Button
                    onClick={resetProcessing}
                    variant="outline"
                    className="flex items-center gap-2 bg-transparent"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                  {generatedImages.length > 0 && (
                    <Button
                      onClick={downloadAllImages}
                      variant="outline"
                      className="flex items-center gap-2 bg-transparent"
                    >
                      <Download className="w-4 h-4" />
                      Download All ({generatedImages.length})
                    </Button>
                  )}
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
            {generatedImages.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Generated Images</CardTitle>
                  <CardDescription>
                    {generatedImages.length} images generated successfully
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {generatedImages.map((image) => (
                      <div key={image.index} className="space-y-2">
                        <img
                          src={`data:image/jpeg;base64,${image.imageData}`}
                          alt={image.prompt}
                          className="w-full h-48 object-cover rounded-lg border"
                        />
                        <p className="text-sm text-muted-foreground truncate">
                          {image.prompt}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadImage(image)}
                          className="w-full"
                        >
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
