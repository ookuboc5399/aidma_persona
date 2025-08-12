"use client";

import { useEffect, useState } from "react";

type RagLog = {
  id: number;
  created_at: string;
  request_payload?: unknown;
  query?: string | null;
  supabase_documents?: unknown;
  prompt?: string | null;
  result?: unknown;
  error?: string | null;
};

export default function LogsPage() {
  const [logs, setLogs] = useState<RagLog[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/logs");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "failed to load logs");
        setLogs(data.logs as RagLog[]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">RAG実行ログ</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      <div className="space-y-6">
        {logs.map((log) => (
          <div key={log.id} className="p-4 border rounded bg-white">
            <div className="text-sm text-gray-500">{new Date(log.created_at).toLocaleString()}</div>
            <details className="mt-2">
              <summary className="font-semibold cursor-pointer">フロントエンドから送られたデータ</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded">{JSON.stringify(log.request_payload, null, 2)}</pre>
            </details>
            <details className="mt-2">
              <summary className="font-semibold cursor-pointer">検索クエリ（Embedding 対象）</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded">{log.query}</pre>
            </details>
            <details className="mt-2">
              <summary className="font-semibold cursor-pointer">Supabaseから返ったドキュメント</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded">{JSON.stringify(log.supabase_documents, null, 2)}</pre>
            </details>
            <details className="mt-2">
              <summary className="font-semibold cursor-pointer">OpenAIに送った最終プロンプト</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded">{log.prompt}</pre>
            </details>
            <details className="mt-2">
              <summary className="font-semibold cursor-pointer">生成結果（JSON）</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded">{JSON.stringify(log.result, null, 2)}</pre>
            </details>
            {log.error && (
              <p className="mt-2 text-red-600 text-sm">Error: {log.error}</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
} 