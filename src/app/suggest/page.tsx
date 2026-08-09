"use client";

import { useState } from "react";
import { Loader2, PlusCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SuggestBrandPage() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setStatus("loading");
    setMessage("Analyzing website and detecting platform...");

    try {
      const res = await fetch("/api/brands/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(data.message);
        setUrl("");
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to add brand.");
      }
    } catch (err) {
      setStatus("error");
      setMessage("Network error occurred.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
            <PlusCircle className="h-6 w-6 text-zinc-400" />
            Suggest a Brand
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Know a dope streetwear brand? Paste the link to their store below. Our engine will automatically analyze it and add their drops to the aggregator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="url" className="text-sm font-medium text-zinc-300">
                Store URL
              </label>
              <Input
                id="url"
                type="url"
                placeholder="https://kith.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-600"
                disabled={status === "loading"}
              />
            </div>

            {status !== "idle" && (
              <div className={`p-3 rounded-md flex items-center gap-2 text-sm ${
                status === "loading" ? "bg-zinc-800 text-zinc-300" :
                status === "success" ? "bg-green-900/30 text-green-400 border border-green-900/50" :
                "bg-red-900/30 text-red-400 border border-red-900/50"
              }`}>
                {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                {status === "success" && <CheckCircle className="h-4 w-4" />}
                {message}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full bg-white text-black hover:bg-zinc-200 font-bold"
              disabled={status === "loading" || !url}
            >
              {status === "loading" ? "Processing..." : "Add Brand"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
