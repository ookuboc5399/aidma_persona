'use client';

import { useState } from 'react';

export default function TestPage() {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runSnowflakeTest = async (testType: string) => {
    setLoading(true);
    setResults(null);

    try {
      let endpoint = '';
      let method = 'GET';
      
      switch(testType) {
        case 'table-info':
          endpoint = '/api/snowflake/table-info';
          method = 'GET';
          break;
        case 'insert-sample-companies':
          endpoint = '/api/snowflake/insert-sample-companies';
          method = 'POST';
          break;
        case 'insert-glap-solution-companies':
          endpoint = '/api/test/insert-glap-solution-companies';
          method = 'POST';
          break;
        default:
          throw new Error('Unknown Snowflake test type');
      }

      console.log(`Running Snowflake test: ${testType} at ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        ...(method === 'POST' && { body: JSON.stringify({}) })
      });

      const data = await response.json();
      setResults(data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Test failed');
      }
    } catch (err: any) {
      console.error('Snowflake test error:', err);
      setResults({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

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
        case 'store-only':
          endpoint = '/api/process/snowflake-store-only';
          break;
        case 'challenge-matching':
          endpoint = '/api/process/challenge-matching';
          break;
        case 'read-for-challenges':
          endpoint = '/api/sheets/read-for-challenges';
          break;
        case 'get-dates':
          endpoint = '/api/sheets/get-dates';
          break;
        case 'get-companies-by-date':
          endpoint = '/api/sheets/get-companies-by-date';
          break;
        case 'access-sheet-test':
          endpoint = '/api/test/access-sheet-test';
          break;
        case 'company-extraction-test':
          endpoint = '/api/test/company-extraction-test';
          break;
        case 'get-cl-dates':
          endpoint = '/api/sheets/get-cl-dates';
          break;
        case 'get-cl-companies-by-date':
          endpoint = '/api/sheets/get-cl-companies-by-date';
          break;
        case 'challenge-matching-by-date':
          endpoint = '/api/process/challenge-matching-by-date';
          break;
        case 'single-challenge-matching':
          endpoint = '/api/process/single-challenge-matching';
          break;
        case 'speaker-filter-test':
          endpoint = '/api/test/speaker-filter-test';
          break;
        case 'company-specific-conversation-test':
          endpoint = '/api/test/company-specific-conversation-test';
          break;
        default:
          throw new Error('Unknown test type');
      }

      // エンドポイントに応じて適切なボディを設定
      let requestBody = {};
      if (testType === 'challenge-matching') {
        requestBody = {
          masterSheetUrl: 'https://docs.google.com/spreadsheets/d/1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY/edit?gid=0#gid=0'
        };
      } else if (testType === 'read-for-challenges') {
        requestBody = {
          url: 'https://docs.google.com/spreadsheets/d/1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY/edit?gid=0#gid=0'
        };
      } else if (testType === 'store-only') {
        requestBody = {
          companyName: 'テスト企業',
          conversationData: 'テスト用の会話データです。',
          sourceUrl: 'https://docs.google.com/spreadsheets/d/test',
          originalCompanyName: 'テスト企業'
        };
      } else if (testType === 'get-dates') {
        requestBody = {
          url: 'https://docs.google.com/spreadsheets/d/1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY/edit?gid=1747100300#gid=1747100300'
        };
      } else if (testType === 'get-companies-by-date') {
        requestBody = {
          date: '2025/07/18',
          url: 'https://docs.google.com/spreadsheets/d/1Ir1MBRQAd1_pcBg2wjMxxiY0Doec4CARt2o5ztsLZKQ/edit'
        };
      } else if (testType === 'access-sheet-test') {
        requestBody = {}; // 空のボディでテスト
      } else if (testType === 'get-cl-dates') {
        requestBody = {
          url: 'https://docs.google.com/spreadsheets/d/1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY/edit?gid=0#gid=0'
        };
      } else if (testType === 'get-cl-companies-by-date') {
        requestBody = {
          date: '2025/07/18',
          url: 'https://docs.google.com/spreadsheets/d/1FpP81uZz-_UyvtlwMKwgXPdEk5c3sP5ZyBvZMpyJTKY/edit'
        };
      } else if (testType === 'challenge-matching-by-date') {
        requestBody = {
          date: '2025/07/18',
          url: 'https://docs.google.com/spreadsheets/d/1FpP81uZz-_UyvtlwMKwgXPdEk5c3sP5ZyBvZMpyJTKY/edit'
        };
      } else if (testType === 'single-challenge-matching') {
        requestBody = {
          companyName: 'テスト企業株式会社',
          conversationData: 'テスト用の会話データです。この企業はITシステムの課題を抱えており、効率化が必要です。',
          columnLetter: 'A',
          extractionMethod: 'ai_extraction'
        };
      } else if (testType === 'speaker-filter-test') {
        requestBody = {}; // 空のボディでテスト
      } else if (testType === 'company-specific-conversation-test') {
        requestBody = {}; // 空のボディでテスト
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
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
        
        <button
          onClick={() => runTest('read-for-challenges')}
          disabled={loading}
          className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          課題対象データ読み取りテスト
        </button>
        
        <button
          onClick={() => runTest('store-only')}
          disabled={loading}
          className="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          企業情報保存のみテスト
        </button>
        
        <button
          onClick={() => runTest('challenge-matching')}
          disabled={loading}
          className="bg-pink-500 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          課題抽出・マッチング処理テスト
        </button>
        
        <button
          onClick={() => runTest('get-dates')}
          disabled={loading}
          className="bg-cyan-500 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          日付一覧取得テスト
        </button>
        
        <button
          onClick={() => runTest('get-companies-by-date')}
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          企業別データ取得テスト
        </button>
        
        <button
          onClick={() => runTest('access-sheet-test')}
          disabled={loading}
          className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          7/18シートアクセステスト
        </button>
        
        <button
          onClick={() => runTest('company-extraction-test')}
          disabled={loading}
          className="bg-violet-500 hover:bg-violet-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          企業名抽出テスト
        </button>

        <button
          onClick={() => runTest('get-cl-dates')}
          disabled={loading}
          className="bg-indigo-500 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          CLシート日付取得
        </button>

        <button
          onClick={() => runTest('get-cl-companies-by-date')}
          disabled={loading}
          className="bg-teal-500 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          CLシート企業データ取得
        </button>

        <button
          onClick={() => runTest('challenge-matching-by-date')}
          disabled={loading}
          className="bg-pink-500 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          指定日付課題マッチング
        </button>

        <button
          onClick={() => runTest('single-challenge-matching')}
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          単一企業課題マッチング
        </button>

        <button
          onClick={() => runTest('speaker-filter-test')}
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          話者フィルターテスト
        </button>

        <button
          onClick={() => runTest('company-specific-conversation-test')}
          disabled={loading}
          className="bg-lime-500 hover:bg-lime-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          企業特定会話抽出テスト
        </button>

        <button
          onClick={() => runSnowflakeTest('table-info')}
          disabled={loading}
          className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          Snowflakeテーブル情報確認
        </button>

        <button
          onClick={() => runSnowflakeTest('insert-sample-companies')}
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          サンプル課題解決企業を挿入
        </button>

        <button
          onClick={() => runSnowflakeTest('insert-glap-solution-companies')}
          disabled={loading}
          className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          GLAP課題解決企業を挿入
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
