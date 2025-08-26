'use client';

import { useState } from 'react';

export default function TestPage() {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runTest = async (testType: string) => {
    setLoading(true);
    setResults(null);

    try {
      let endpoint = '';
      switch (testType) {
        case 'challenge-extraction':
          endpoint = '/api/test/challenge-extraction';
          break;
        case 'company-extraction-debug':
          endpoint = '/api/test/company-extraction-debug';
          break;
        case 'integrated-snowflake':
          endpoint = '/api/test/integrated-snowflake';
          break;
        case 'snowflake-ai-match':
          endpoint = '/api/test/snowflake-ai-match';
          break;
        case 'unified-extraction':
          endpoint = '/api/test/unified-extraction';
          break;
        default:
          throw new Error('Unknown test type');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const result = await response.json();
      setResults(result);
    } catch (error) {
      setResults({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">テストページ</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => runTest('challenge-extraction')}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          課題抽出テスト
        </button>
        
        <button
          onClick={() => runTest('company-extraction-debug')}
          disabled={loading}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          企業情報抽出デバッグ
        </button>
        
        <button
          onClick={() => runTest('integrated-snowflake')}
          disabled={loading}
          className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          Snowflake + Snowflake AI + DB 統合テスト
        </button>
        
        <button
          onClick={() => runTest('snowflake-ai-match')}
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          Snowflake AI マッチングテスト
        </button>
        
        <button
          onClick={() => runTest('unified-extraction')}
          disabled={loading}
          className="bg-teal-500 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          統合抽出テスト
        </button>
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2">テスト実行中...</p>
        </div>
      )}

      {results && (
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-bold mb-4">テスト結果</h2>
          <pre className="bg-white p-4 rounded overflow-auto max-h-96 text-sm">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
