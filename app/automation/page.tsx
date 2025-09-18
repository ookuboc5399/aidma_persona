'use client';

import { useState } from 'react';

interface BatchResult {
  success: boolean;
  message?: string;
  summary?: {
    totalProcessed: number;
    totalErrors: number;
    totalAttempts: number;
  };
  results?: Array<{
    sheetType: string;
    date?: string;
    success: boolean;
    processedCompanies?: number;
    totalMatches?: number;
    error?: string;
  }>;
  timestamp?: string;
  error?: string;
}

interface AutoProcessResult {
  success: boolean;
  message?: string;
  sheetType?: string;
  date?: string;
  processedCompanies?: number;
  totalMatches?: number;
  processing?: {
    success: boolean;
    results: number;
  };
  writing?: {
    success: boolean;
    updatedRows: number;
  };
  timestamp?: string;
  error?: string;
}

export default function AutomationPage() {
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [autoProcessResult, setAutoProcessResult] = useState<AutoProcessResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 手動バッチ処理実行
  const handleBatchProcess = async () => {
    setIsLoading(true);
    setError('');
    setBatchResult(null);

    try {
      console.log('バッチ処理開始...');
      
      const response = await fetch('/api/automation/batch-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          daysBack: 7,
          checkProcessedFlag: false // 現在は未実装のため false
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'バッチ処理に失敗しました');
      }

      setBatchResult(result);
      console.log('バッチ処理完了:', result);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error('バッチ処理エラー:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 手動で特定日付を処理
  const handleManualProcess = async (sheetType: 'CL' | 'CU' | 'CP', date: string) => {
    setIsLoading(true);
    setError('');
    setAutoProcessResult(null);

    try {
      console.log(`手動処理開始: ${sheetType} - ${date}`);
      
      const response = await fetch('/api/automation/process-new-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sheetType,
          date,
          spreadsheetId: '1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY',
          resultSpreadsheetId: '1jiead_e52qCXW2zU0ohqJwLqdbb2OyhpAg1urVJEVCY'
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || '手動処理に失敗しました');
      }

      setAutoProcessResult(result);
      console.log('手動処理完了:', result);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error('手動処理エラー:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // テスト処理
  const handleTestProcess = async () => {
    await handleManualProcess('CU', '2025/09/04');
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">自動化システム管理</h1>
      
      {/* システム概要 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-blue-800 mb-4">🤖 自動化システム概要</h2>
        <div className="space-y-3 text-blue-700">
          <p>
            <strong>Google Apps Script監視:</strong> スプレッドシートに新しい列（企業データ）が追加されると自動的に検知し、処理を実行
          </p>
          <p>
            <strong>バッチ処理:</strong> 定期実行で未処理のデータをチェックして一括処理
          </p>
          <p>
            <strong>手動処理:</strong> 管理画面から特定の日付・シートタイプを指定して処理実行
          </p>
        </div>
      </div>

      {/* 手動操作パネル */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* バッチ処理 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">📦 バッチ処理</h3>
          <p className="text-gray-600 mb-4">
            過去7日分の未処理データを一括で処理します
          </p>
          <button
            onClick={handleBatchProcess}
            disabled={isLoading}
            className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '処理中...' : 'バッチ処理実行'}
          </button>
        </div>

        {/* テスト処理 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">🧪 テスト処理</h3>
          <p className="text-gray-600 mb-4">
            2025/09/04 CUシートのデータでテスト処理を実行
          </p>
          <button
            onClick={handleTestProcess}
            disabled={isLoading}
            className="w-full bg-green-500 hover:bg-green-700 text-white font-bold py-3 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '処理中...' : 'テスト処理実行'}
          </button>
        </div>
      </div>

      {/* 手動処理フォーム */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">⚙️ 手動処理</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">シートタイプ</label>
            <select
              id="sheetType"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="CL">CLシート</option>
              <option value="CU">CUシート</option>
              <option value="CP">CPシート</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">日付</label>
            <input
              type="text"
              id="date"
              placeholder="2025/09/04"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                const sheetType = (document.getElementById('sheetType') as HTMLSelectElement).value as 'CL' | 'CU' | 'CP';
                const date = (document.getElementById('date') as HTMLInputElement).value;
                if (date) {
                  handleManualProcess(sheetType, date);
                } else {
                  setError('日付を入力してください');
                }
              }}
              disabled={isLoading}
              className="w-full bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '処理中...' : '手動処理実行'}
            </button>
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h4 className="text-red-800 font-semibold mb-2">❌ エラー</h4>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* バッチ処理結果 */}
      {batchResult && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">📊 バッチ処理結果</h3>
          
          {batchResult.success ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="text-green-800 font-semibold">処理成功</h4>
                  <p className="text-2xl font-bold text-green-600">
                    {batchResult.summary?.totalProcessed || 0}件
                  </p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="text-red-800 font-semibold">処理エラー</h4>
                  <p className="text-2xl font-bold text-red-600">
                    {batchResult.summary?.totalErrors || 0}件
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-blue-800 font-semibold">総試行数</h4>
                  <p className="text-2xl font-bold text-blue-600">
                    {batchResult.summary?.totalAttempts || 0}件
                  </p>
                </div>
              </div>

              {/* 詳細結果 */}
              {batchResult.results && batchResult.results.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">詳細結果</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            シート
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            日付
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            状態
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            処理企業数
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            マッチ数
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {batchResult.results.map((result, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {result.sheetType}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {result.date || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {result.success ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  成功
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  エラー
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {result.processedCompanies || 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {result.totalMatches || 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">{batchResult.error}</p>
            </div>
          )}
        </div>
      )}

      {/* 手動処理結果 */}
      {autoProcessResult && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">🔧 手動処理結果</h3>
          
          {autoProcessResult.success ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="text-green-800 font-semibold">処理完了</h4>
                  <p className="text-sm text-green-700">
                    {autoProcessResult.sheetType}シート - {autoProcessResult.date}
                  </p>
                  <p className="text-lg font-bold text-green-600">
                    {autoProcessResult.processedCompanies}社処理
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-blue-800 font-semibold">マッチング結果</h4>
                  <p className="text-lg font-bold text-blue-600">
                    {autoProcessResult.totalMatches}件のマッチ
                  </p>
                </div>
              </div>

              {/* 処理詳細 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-800 mb-2">課題抽出・マッチング</h5>
                  <p className="text-sm text-gray-600">
                    状態: {autoProcessResult.processing?.success ? '✅ 成功' : '❌ 失敗'}
                  </p>
                  <p className="text-sm text-gray-600">
                    結果: {autoProcessResult.processing?.results || 0}件
                  </p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-800 mb-2">スプレッドシート書き込み</h5>
                  <p className="text-sm text-gray-600">
                    状態: {autoProcessResult.writing?.success ? '✅ 成功' : '❌ 失敗'}
                  </p>
                  <p className="text-sm text-gray-600">
                    更新行数: {autoProcessResult.writing?.updatedRows || 0}行
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">{autoProcessResult.error}</p>
            </div>
          )}
        </div>
      )}

      {/* Google Apps Script設定ガイド */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-8">
        <h3 className="text-lg font-semibold text-yellow-800 mb-4">⚠️ Google Apps Script設定</h3>
        <div className="space-y-3 text-yellow-700">
          <p>
            <strong>1. Google Apps Scriptプロジェクトを作成:</strong> 
            <code className="bg-yellow-100 px-2 py-1 rounded ml-2">
              automation/google-apps-script/sheet-monitor.js
            </code>
            のコードをコピー
          </p>
          <p>
            <strong>2. 設定を更新:</strong> CONFIG オブジェクト内の NEXTJS_BASE_URL を本番URLに変更
          </p>
          <p>
            <strong>3. トリガーを設定:</strong> setupTriggers() 関数を実行して5分間隔の監視を開始
          </p>
          <p>
            <strong>4. 権限を許可:</strong> Google Sheets API と UrlFetch の権限を許可
          </p>
        </div>
      </div>
    </div>
  );
}
