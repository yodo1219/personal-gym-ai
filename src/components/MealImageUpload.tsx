"use client";
import { useState, useRef, useCallback } from "react";
import { NutritionData, NutritionEvaluation, NutritionTarget } from "@/types";

interface AnalyzeResult {
  nutrition: NutritionData;
  target: NutritionTarget;
  evaluation: NutritionEvaluation;
  dangerLevel: string;
  dangerReasons: string[];
  aiReply: string;
  goodPoints: string[];
  improvements: string[];
  nextAction: string;
  fileName: string;
}

interface ImageItem {
  base64: string;
  fileName: string;
  preview: string;
  status: "waiting" | "analyzing" | "done" | "error";
  result?: AnalyzeResult;
}

interface Props {
  clientId: string;
  onAnalyzed: (results: AnalyzeResult[], fileNames: string[]) => void;
}

export default function MealImageUpload({ clientId, onAnalyzed }: Props) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (files: File[]) => {
    const validFiles = files.filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
    if (validFiles.length === 0) {
      setError("画像ファイル（JPG/PNG/WEBP・10MB以下）を選択してください");
      return;
    }
    setError("");

    // Base64変換
    const newItems: ImageItem[] = await Promise.all(
      validFiles.map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          base64: base64.split(",")[1],
          fileName: file.name,
          preview: base64,
          status: "waiting" as const,
        };
      })
    );

    setImages((prev) => [...prev, ...newItems]);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) processFiles(files);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function analyzeAll() {
    if (images.length === 0 || analyzing) return;
    setAnalyzing(true);
  
    // 全画像を「解析中」に
    setImages((prev) => prev.map((img) => ({ ...img, status: "analyzing" as const })));
  
    try {
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          images: images.map((img) => ({
            base64: img.base64,
            mimeType: "image/jpeg",
          })),
          fileName: images.map((img) => img.fileName).join("、"),
        }),
      });
  
      if (!res.ok) throw new Error("解析失敗");
      const result: AnalyzeResult = await res.json();
  
      // 全画像を「完了」に
      setImages((prev) => prev.map((img) => ({ ...img, status: "done" as const })));
      onAnalyzed([result], images.map((img) => img.fileName));
    } catch {
      setImages((prev) => prev.map((img) => ({ ...img, status: "error" as const })));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ドロップゾーン */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
          ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50"}`}
      >
        <div className="text-3xl mb-2">📸</div>
        <p className="font-medium text-gray-700 mb-1">スクリーンショットをアップロード</p>
        <p className="text-sm text-gray-400">複数枚まとめて選択できます</p>
        <p className="text-xs text-gray-400 mt-1">クリックまたはドラッグ＆ドロップ（JPG/PNG/WEBP・10MB以下）</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* エラー */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* 画像プレビュー一覧 */}
      {images.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {images.map((img, i) => (
              <div key={i} className="relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                <img
                  src={img.preview}
                  alt={img.fileName}
                  className="w-full h-36 object-contain"
                />
                {/* ステータスバッジ */}
                <div className="absolute top-2 left-2">
                  {img.status === "waiting" && (
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">待機中</span>
                  )}
                  {img.status === "analyzing" && (
                    <span className="bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                      <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                      解析中
                    </span>
                  )}
                  {img.status === "done" && (
                    <span className="bg-green-100 text-green-600 text-xs px-2 py-1 rounded-full">✓ 完了</span>
                  )}
                  {img.status === "error" && (
                    <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full">❌ エラー</span>
                  )}
                </div>
                {/* 削除ボタン */}
                {!analyzing && (
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-2 right-2 bg-white border border-gray-200 text-gray-500 rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-100"
                  >
                    ✕
                  </button>
                )}
                <p className="text-xs text-gray-400 p-1 truncate">{img.fileName}</p>
              </div>
            ))}
          </div>

          {/* 解析ボタン */}
          <button
            onClick={analyzeAll}
            disabled={analyzing || images.every((img) => img.status === "done")}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {analyzing
              ? `⏳ 解析中... (${images.filter((i) => i.status === "done").length}/${images.length}枚完了)`
              : images.every((i) => i.status === "done")
              ? "✓ 全枚数の解析完了"
              : `✨ ${images.length}枚を解析する`}
          </button>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}