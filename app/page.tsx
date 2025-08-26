
'use client';

import { useState, useRef, useEffect } from 'react';

// 型定義
interface CompanyData {
  rowIndex: number;
  targetSheetId: string;
  sheetUrl: string;
  companyName: string;
  conversationData: string;
  error?: string;
}

interface Challenge {
  category: string;
  title: string;
  description: string;
  urgency: string;
  keywords: string[];
}

interface MatchingResult {
  company_id: string;
  company_name: string;
  industry: string;
  region: string;
  prefecture: string;
  business_description: string;
  match_score: number;
  match_reason: string;
  solution_details: string;
  advantages: string[];
  considerations: string[];
  implementation_timeline: string;
  estimated_cost: string;
}

interface ProcessedCompany {
  rowIndex: number;
  companyName: string;
  extractedChallenges: string[];
  challenges: {
    challenges: Challenge[];
    summary: string;
  };
  matches: MatchingResult[];
  totalMatches: number;
  isProcessing?: boolean;
  error?: string;
}

function toMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}



export default function Home() {
  const [masterUrl] = useState('https://docs.google.com/spreadsheets/d/1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY/edit?gid=1747100300#gid=1747100300');
  const [companyData, setCompanyData] = useState<CompanyData[]>([]);
  const [processedCompanies, setProcessedCompanies] = useState<ProcessedCompany[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const handleReadSheet = async () => {
    await handleReadSheetInternal();
  };

  const handleReadSpecificRow = async (rowIndex: number) => {
    await handleReadSheetInternal(rowIndex);
  };

  const handleReadSheetInternal = async (rowIndex?: number) => {
    console.log('[UI] handleReadSheet: start', { rowIndex });
    setIsLoading(true);
    setGlobalError('');
    setCompanyData([]);
    setProcessedCompanies([]);
    try {
      const endpoint = rowIndex ? '/api/sheets/read-row' : '/api/sheets/read';
      const body = rowIndex 
        ? { url: masterUrl, rowIndex }
        : { url: masterUrl };
      
      console.log('[UI] POST', endpoint, body);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to read sheet');
      console.log('[UI]', endpoint, 'raw data:', JSON.stringify(result.data, null, 2));
      console.log('[UI]', endpoint, 'success', result);
      // 会話データが存在する企業のみをフィルタリング
      const validCompanies = result.data.filter((c: CompanyData) => c.conversationData && c.conversationData.trim() !== '');
      setCompanyData(validCompanies);
    } catch (err: unknown) {
      setGlobalError(toMessage(err));
      console.error('[UI] handleReadSheet error', err);
    } finally {
      setIsLoading(false);
      console.log('[UI] handleReadSheet: end');
    }
  };

  // Eased smooth scroll (cubic)
  const smoothScrollTo = (targetY: number, duration = 900) => {
    const startY = window.scrollY;
    const delta = targetY - startY;
    const start = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const step = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      const y = startY + delta * ease(elapsed);
      window.scrollTo({ top: y });
      if (elapsed < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  };

  useEffect(() => {
    if (companyData.length > 0 && resultsRef.current) {
      const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - 16;
      smoothScrollTo(y, 900);
    }
  }, [companyData.length]);

  const handleProcessCompany = async (rowIndex: number, options: {
    dataSource: 'supabase' | 'snowflake';
    aiMethod: 'chatgpt' | 'snowflake-ai' | 'snowflake-db';
    extractCompanyInfo: boolean;
  } = { dataSource: 'supabase', aiMethod: 'chatgpt', extractCompanyInfo: true }) => {
    const companyInfo = companyData.find(c => c.rowIndex === rowIndex);
    if (!companyInfo || companyInfo.error) {
      console.error('Company data not found or has error');
      return;
    }

    // 処理状態を更新
    setProcessedCompanies(prev => {
      const existing = prev.find(p => p.rowIndex === rowIndex);
      if (existing) {
        return prev.map(p => p.rowIndex === rowIndex ? { ...p, isProcessing: true, error: undefined } : p);
      } else {
        return [...prev, {
          rowIndex,
          companyName: companyInfo.companyName,
          extractedChallenges: [],
          challenges: { challenges: [], summary: '' },
          matches: [],
          totalMatches: 0,
          isProcessing: true,
        }];
      }
    });

    try {
      // データソースとAI手法に基づいてAPIエンドポイントを選択
      let apiEndpoint: string = '';
      const requestBody: {
        companyName: string;
        conversationData: string;
        sourceUrl: string;
        extractCompanyInfo: boolean;
      } = {
        companyName: companyInfo.companyName,
        conversationData: companyInfo.conversationData,
        sourceUrl: companyInfo.sheetUrl,
        extractCompanyInfo: options.extractCompanyInfo
      };

      if (options.dataSource === 'supabase') {
        if (options.aiMethod === 'chatgpt') {
          apiEndpoint = '/api/process/full';
        } else if (options.aiMethod === 'snowflake-ai') {
          apiEndpoint = '/api/process/supabase-snowflake-ai';
        }
      } else { // snowflake
        if (options.aiMethod === 'chatgpt') {
          apiEndpoint = '/api/process/snowflake-chatgpt-db';
        } else if (options.aiMethod === 'snowflake-ai') {
          apiEndpoint = '/api/process/snowflake-ai-db';
        }
      }

      if (!apiEndpoint) {
        throw new Error('Invalid data source or AI method combination');
      }

      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to process company');

      setProcessedCompanies(prev => 
        prev.map(p => p.rowIndex === rowIndex ? {
          ...p,
          extractedChallenges: result.extractedChallenges,
          challenges: result.challenges,
          matches: result.matches,
          totalMatches: result.totalMatches,
          isProcessing: false,
        } : p)
      );

    } catch (err: unknown) {
      setProcessedCompanies(prev => 
        prev.map(p => p.rowIndex === rowIndex ? {
          ...p,
          isProcessing: false,
          error: toMessage(err),
        } : p)
      );
    }
  };

  const handleProcessAllCompanies = async (dataSource: 'supabase' | 'snowflake' = 'supabase', aiMethod: 'snowflake-ai' = 'snowflake-ai') => {
    const validCompanies = companyData.filter(c => !c.error);
    
    for (const company of validCompanies) {
      await handleProcessCompany(company.rowIndex, { dataSource, aiMethod, extractCompanyInfo: true });
    }
  };

  return (
    <main>
      {/* Hero */}
      <section className="relative min-h-[100svh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-center bg-cover pointer-events-none" style={{ backgroundImage: "url(/top1.png)" }}></div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#0b1020]/40 to-[#0b1020] pointer-events-none"></div>
        <div className="relative z-30 text-center space-y-5">
          <p className="text-white/70 text-sm tracking-widest">AI-powered business matching solution</p>
          <h1 className="text-3xl md:text-5xl font-bold [font-family:var(--font-serif-jp)]">企業課題解決<br className="md:hidden"/>マッチングシステム</h1>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button type="button" onClick={handleReadSheet} disabled={isLoading} className="px-6 py-3 bg-blue-600 text-white rounded-md text-lg disabled:bg-gray-600 cursor-pointer hover:bg-blue-500 transition">
              {isLoading ? 'スプレッドシート読込中...' : '全データ読み込み'}
            </button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="行番号"
                min="1"
                value={selectedRowIndex || ''}
                onChange={(e) => setSelectedRowIndex(e.target.value ? parseInt(e.target.value) : null)}
                className="px-3 py-2 border border-gray-300 rounded-md text-center w-20"
                disabled={isLoading}
              />
              <button 
                type="button" 
                onClick={() => selectedRowIndex && handleReadSpecificRow(selectedRowIndex)} 
                disabled={isLoading || !selectedRowIndex}
                className="px-4 py-3 bg-green-600 text-white rounded-md text-lg disabled:bg-gray-600 cursor-pointer hover:bg-green-500 transition"
              >
                {isLoading ? '読込中...' : '特定行読み込み'}
              </button>
            </div>
          </div>
          {globalError && (
            <p className="text-red-300 bg-red-900/30 border border-red-800 inline-block px-3 py-2 rounded-md">Error: {globalError}</p>
          )}
        </div>
      </section>

      {/* Actions (error only) */}
      <section className="container mx-auto px-4 -mt-8 relative z-20">
        {globalError && <p className="text-red-400 bg-red-900/30 border border-red-800 p-3 rounded-md mb-4">Error: {globalError}</p>}
      </section>

      {/* Company Data Display */}
      {companyData.length > 0 && (
        <section ref={resultsRef} className="relative py-10">
          <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: 'url(/top1.png)' }}></div>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#0b1020]/80 to-[#0b1020]"></div>
          <div className="relative container mx-auto px-4">
            <div className="bg-white/95 text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 backdrop-blur-sm">
              <h2 className="text-4xl font-bold [font-family:var(--font-serif-jp)] text-slate-900 tracking-wide">企業データ・課題マッチング</h2>
              <div className="mt-6 flex justify-end space-x-3">

                <button 
                  onClick={() => handleProcessAllCompanies('supabase', 'snowflake-ai')} 
                  className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition"
                  title="Supabase企業 + Snowflake AIマッチング"
                >
                  Supabase + Snowflake AI
                </button>

                <button 
                  onClick={() => handleProcessAllCompanies('snowflake', 'snowflake-ai')} 
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                  title="Snowflake企業 + Snowflake AI + DB"
                >
                  Snowflake + Snowflake AI + DB
                </button>
              </div>
              <div className="mt-6 space-y-6">
                {companyData.map((company) => {
                  const processed = processedCompanies.find(p => p.rowIndex === company.rowIndex);
                  
                  return (
                    <div key={company.rowIndex} className="p-6 border border-gray-200 rounded-lg shadow-sm bg-white">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="font-bold text-xl [font-family:var(--font-serif-jp)] text-blue-800">
                          {company.companyName} (行 {company.rowIndex})
                        </h3>
                        {!processed ? (
                          <div className="flex space-x-2">
                            <div className="flex flex-col space-y-2">
                              <div className="flex space-x-2">

                                <button 
                                  onClick={() => handleProcessCompany(company.rowIndex, { dataSource: 'supabase', aiMethod: 'snowflake-ai', extractCompanyInfo: true })}
                                  className="px-3 py-1 bg-orange-700 text-white rounded-md text-sm hover:bg-orange-800 transition"
                                  title="Supabase企業 + Snowflake AIマッチング"
                                >
                                  Supabase + Snowflake AI
                                </button>
                              </div>
                              <div className="flex space-x-2">

                                <button 
                                  onClick={() => handleProcessCompany(company.rowIndex, { dataSource: 'snowflake', aiMethod: 'snowflake-ai', extractCompanyInfo: true })}
                                  className="px-3 py-1 bg-blue-700 text-white rounded-md text-sm hover:bg-blue-800 transition"
                                  title="Snowflake企業 + Snowflake AI + DB"
                                >
                                  Snowflake + Snowflake AI + DB
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : processed.isProcessing ? (
                          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-md text-sm">
                            処理中...
                          </span>
                        ) : processed.error ? (
                          <span className="px-3 py-1 bg-red-100 text-red-800 rounded-md text-sm">
                            エラー
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-md text-sm">
                            完了 ({processed.totalMatches}件マッチ)
                          </span>
                        )}
                      </div>

                      {company.error ? (
                        <p className="text-red-600">エラー: {company.error}</p>
                      ) : (
                        <div className="space-y-4">
                          <div className="bg-gray-50 p-3 rounded">
                            <p className="text-sm text-gray-600 mb-2">会話データ（抜粋）:</p>
                            <p className="text-sm whitespace-pre-wrap line-clamp-3">
                              {company.conversationData.substring(0, 200)}...
                            </p>
                          </div>

                          {processed && !processed.isProcessing && !processed.error && (
                            <div className="space-y-4">
                              {/* 抽出された課題 */}
                              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                                <h4 className="font-bold text-lg text-yellow-800 mb-2">抽出された課題</h4>
                                <div className="space-y-2">
                                  {processed.challenges?.challenges?.map((challenge, idx) => (
                                    <div key={idx} className="bg-white p-3 rounded border-l-4 border-yellow-400">
                                      <h5 className="font-semibold text-sm text-yellow-700">
                                        {challenge.category} - {challenge.title}
                                        <span className={`ml-2 px-2 py-1 text-xs rounded ${
                                          challenge.urgency === '高' ? 'bg-red-100 text-red-700' :
                                          challenge.urgency === '中' ? 'bg-yellow-100 text-yellow-700' :
                                          'bg-gray-100 text-gray-700'
                                        }`}>
                                          {challenge.urgency}
                                        </span>
                                      </h5>
                                      <p className="text-sm text-gray-600 mt-1">{challenge.description}</p>
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {challenge.keywords.map((keyword, kidx) => (
                                          <span key={kidx} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                            {keyword}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* マッチング結果 */}
                              {processed.matches.length > 0 && (
                                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                  <h4 className="font-bold text-lg text-green-800 mb-3">
                                    マッチング結果 ({processed.totalMatches}件)
                                  </h4>
                                  <div className="space-y-3">
                                    {processed.matches.slice(0, 3).map((match, idx) => (
                                      <div key={idx} className="bg-white p-4 rounded border border-green-200">
                                        <div className="flex justify-between items-start mb-2">
                                          <h5 className="font-bold text-green-700">
                                            {match.company_name}
                                          </h5>
                                          <div className="flex items-center space-x-2">
                                            <span className="text-sm text-gray-600">
                                              マッチ度: {(match.match_score * 100).toFixed(0)}%
                                            </span>
                                            <div 
                                              className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden"
                                            >
                                              <div 
                                                className="h-full bg-gradient-to-r from-green-400 to-green-600"
                                                style={{ width: `${match.match_score * 100}%` }}
                                              ></div>
                                            </div>
                                          </div>
                                        </div>
                                        <p className="text-sm text-gray-600 mb-2">
                                          <span className="font-semibold">業種:</span> {match.industry || '未設定'} | 
                                          <span className="font-semibold ml-2">地域:</span> {match.prefecture || '未設定'}
                                        </p>
                                        <p className="text-sm text-gray-700 mb-2">{match.match_reason}</p>
                                        <details className="text-sm">
                                          <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                                            詳細を見る
                                          </summary>
                                          <div className="mt-2 space-y-2 p-2 bg-gray-50 rounded">
                                            <div>
                                              <span className="font-semibold">解決方法:</span>
                                              <p className="text-gray-700">{match.solution_details}</p>
                                            </div>
                                            <div>
                                              <span className="font-semibold">メリット:</span>
                                              <ul className="list-disc list-inside text-gray-700">
                                                {match.advantages.map((advantage: string, aidx: number) => (
                                                  <li key={aidx}>{advantage}</li>
                                                ))}
                                              </ul>
                                            </div>
                                            <div>
                                              <span className="font-semibold">検討事項:</span>
                                              <ul className="list-disc list-inside text-gray-700">
                                                {match.considerations.map((consideration: string, cidx: number) => (
                                                  <li key={cidx}>{consideration}</li>
                                                ))}
                                              </ul>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 mt-2">
                                              <div>
                                                <span className="font-semibold">実装期間:</span>
                                                <p className="text-gray-700">{match.implementation_timeline}</p>
                                              </div>
                                              <div>
                                                <span className="font-semibold">概算コスト:</span>
                                                <p className="text-gray-700">{match.estimated_cost}</p>
                                              </div>
                                            </div>
                                          </div>
                                        </details>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {processed && processed.error && (
                            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                              <p className="text-red-700">エラー: {processed.error}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* About/Solution style sections could be added here if needed */}
    </main>
  );
}

