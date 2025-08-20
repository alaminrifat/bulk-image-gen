"use client";

import type React from "react";

import { useState, useRef } from "react";
import { useEffect, useCallback } from "react";
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
import { Spinner } from "@/components/ui/spinner";
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
import Together from "together-ai";
import ApiKeyModal from "@/components/ApiKeyModal";

interface PromptData {
  prompt: string;
  index: number;
}

interface GeneratedImage {
  prompt: string;
  imageData: string;
  index: number;
}

const DIMENSION_OPTIONS = [
  { label: "768 × 768 (Square)", value: "768x768" },
  { label: "768 × 432 (Landscape)", value: "768x432" },
  { label: "432 × 768 (Portrait)", value: "432x768" },
  { label: "1792 × 768 (Wide)", value: "1792x768" },
];

export default function BatchImageGenerator() {
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [prompts, setPrompts] = useState<PromptData[]>([]);
  const [manualPrompts, setManualPrompts] = useState<string[]>([""]);
  const [dimensions, setDimensions] = useState("768x432");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  const addManualPrompt = () => {
    setManualPrompts([...manualPrompts, ""]);
  };

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
  // API key is set via modal and stored in localStorage (encrypted)
  const [apiKey, setApiKey] = useState<string | null>(null);
  // Only instantiate Together if apiKey is present
  const together = apiKey ? new Together({ apiKey }) : null;

  // Show modal if no API key
  const handleApiKeySet = (key: string) => setApiKey(key);

  const generateImage = async (
    prompt: string,
    width: number,
    height: number
  ): Promise<string> => {
    // Use Together SDK to generate image
    try {
      if (!together) throw new Error("API key is required");
      const response = await together.images.create({
        model: "black-forest-labs/FLUX.1-schnell-Free",
        prompt,
        steps: 4, // API only allows 1-4
        n: 1, // Generate one image at a time
        width,
        height,
        response_format: "base64", // Prefer base64 output
      });
      if (!response || !response.data || !response.data[0]) {
        throw new Error("Invalid response from Together API");
      }
      // Patch: add b64_json as optional to both types for type safety
      type ImageDataB64OrURL = {
        b64_json?: string;
        url?: string;
        type: string;
        index: number;
      };
      const imageData = response.data[0] as ImageDataB64OrURL;
      if (imageData.b64_json) {
        return imageData.b64_json;
      } else {
        throw new Error("No valid image data returned");
      }
    } catch (err: any) {
      throw new Error(`Failed to generate image: ${err?.message || err}`);
    }
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

    // Remove duplicate prompts (case-insensitive, trimmed)
    const seen = new Set<string>();
    const uniquePrompts = prompts.filter((p) => {
      const key = p.prompt.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setTotalToProcess(uniquePrompts.length);

    const [width, height] = dimensions.split("x").map(Number);

    try {
      for (let i = currentIndex; i < uniquePrompts.length; i++) {
        if (isPaused || abortControllerRef.current?.signal.aborted) break;

        setCurrentIndex(i + 1); // progress is 1-based for user feedback
        setError(null); // Clear error for each new prompt

        try {
          setIsProcessing(true); // Ensure loading state is set for each image
          const imageData = await generateImage(
            uniquePrompts[i].prompt,
            width,
            height
          );

          const newImage: GeneratedImage = {
            prompt: uniquePrompts[i].prompt,
            imageData,
            index: i,
          };

          setGeneratedImages((prev) => [...prev, newImage]);

          // Auto-download the image
          downloadImage(newImage);
        } catch (err) {
          console.error(`Error generating image for prompt ${i}:`, err);
          setError(
            `Failed to generate image for prompt ${i + 1}: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }

        // Wait 10 seconds between API calls
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(`Processing failed: ${err.message}`);
      }
    } finally {
      setIsProcessing(false);
      setCurrentIndex(0); // Only reset after all done
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
    link.href = `data:image/png;base64,${image.imageData}`;
    link.download = `generated-image-${image.index + 1}.png`;
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
      {/* Always render the API key modal. It will handle its own show/hide logic. */}
      <ApiKeyModal onApiKeySet={handleApiKeySet} />
      {/* Only render the main app UI if apiKey is set */}
      {apiKey && (
        <div className="min-h-screen bg-background p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold">Batch Image Generator</h1>
              <p className="text-muted-foreground">
                Upload a JSON file with prompts or add them manually to generate
                images.
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
                    <Label htmlFor="dimensions">Image Dimensions</Label>
                    <Select value={dimensions} onValueChange={setDimensions}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIMENSION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* <div className="space-y-2">
                    <Label>Model Information</Label>
                    <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                      Using FLUX.1-schnell-Free model
                      <br />
                      Fast generation, high quality images
                    </div>
                  </div> */}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Processing</CardTitle>
                <CardDescription>
                  {isProcessing
                    ? `Processing prompt ${currentIndex + 1} of ${
                        prompts.length
                      }`
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
                          src={`data:image/png;base64,${image.imageData}`}
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
