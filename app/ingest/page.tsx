"use client";

import { useState } from "react";

export default function IngestPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/rag/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "インポートに失敗しました");
      setMessage(`インポート完了: ${data.inserted} 件を保存しました`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">RAGナレッジ取り込み</h1>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium mb-1">スプレッドシートURL</label>
          <input
            type="url"
            required
            placeholder="https://docs.google.com/spreadsheets/d/.../edit"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
        >
          {loading ? "取り込み中..." : "取り込む"}
        </button>
      </form>
      {message && (
        <p className="mt-4 text-sm">{message}</p>
      )}
      <div className="mt-6">
        <a href="/logs" className="text-blue-600 underline">実行ログを見る</a>
      </div>
    </main>
  );
} 