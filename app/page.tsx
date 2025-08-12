
'use client';

import { useState, useRef, useEffect } from 'react';

// 型定義
interface ExtractedData {
  representative: string;
  address: string;
  employees: string;
  website: string;
  founded: string;
  businessInfo: string;
  marketingPurpose: string;
  receptionistTalk: string;
  targetTalk: string;
  closingTalk: string;
  apptConfirmationTalk: string;
  hearingTalk: string;
  industry?: string;
}

interface SheetRow {
  rowIndex: number;
  targetSheetId: string;
  data?: ExtractedData;
  error?: string;
  ragResult?: {
    results: { talk_type: string; improved_talk: string; reason: string }[];
  };
  isGenerating?: boolean;
  isApplying?: boolean;
}

interface TalkResult {
  results: { talk_type: string; improved_talk: string; reason: string }[];
}

function toMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

// Desired display order for improved talks
const TALK_ORDER = ['受付突破', '対象者通話', 'クロージング', 'アポイント確認', 'ヒアリング'];
function getTalkOrderIndex(type: string): number {
  const idx = TALK_ORDER.findIndex(label => type?.includes(label));
  return idx === -1 ? TALK_ORDER.length : idx;
}

export default function Home() {
  const [masterUrl] = useState('https://docs.google.com/spreadsheets/d/1cl_Rtk2WoBU1gJQ94sJ4d-dK9hklzTDiC5qxq5afcYo/edit?gid=0#gid=0');
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const handleReadSheet = async () => {
    console.log('[UI] handleReadSheet: start');
    setIsLoading(true);
    setGlobalError('');
    setSheetRows([]);
    try {
      console.log('[UI] POST /api/sheets/read');
      const res = await fetch('/api/sheets/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: masterUrl }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to read sheet');
      console.log('[UI] /api/sheets/read success', result);
      setSheetRows(result.data);
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
    if (sheetRows.length > 0 && resultsRef.current) {
      const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - 16;
      smoothScrollTo(y, 900);
    }
  }, [sheetRows.length]);

  const handleGenerateTalk = async (rowIndex: number) => {
    setSheetRows(rows => rows.map(r => r.rowIndex === rowIndex ? { ...r, isGenerating: true } : r));
    
    const targetRow = sheetRows.find(r => r.rowIndex === rowIndex);
    if (!targetRow || !targetRow.data) return;

    try {
      const res = await fetch('/api/rag/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetRow.data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to generate talk');
      
      setSheetRows(rows => rows.map(r => r.rowIndex === rowIndex ? { ...r, ragResult: result, isGenerating: false } : r));
    } catch (err: unknown) {
      setGlobalError(`Row ${rowIndex}: ${toMessage(err)}`);
      setSheetRows(rows => rows.map(r => r.rowIndex === rowIndex ? { ...r, isGenerating: false } : r));
    }
  };

  const handleGenerateAllTalks = async () => {
    setSheetRows(rows =>
      rows.map(r => (r.data && !r.ragResult ? { ...r, isGenerating: true } : r))
    );

    type ApiCallResult = { rowIndex: number; result?: TalkResult; error?: string };
    const promises: Promise<ApiCallResult>[] = sheetRows.map(row => {
      if (row.data && !row.ragResult) {
        return fetch('/api/rag/talk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(row.data),
        })
        .then(res => res.json())
        .then(result => ({ rowIndex: row.rowIndex, result: result as TalkResult }))
        .catch(error => ({ rowIndex: row.rowIndex, error: toMessage(error) }));
      }
      return Promise.resolve({ rowIndex: row.rowIndex, error: 'Skipped' });
    });

    const results = await Promise.all(promises);

    setSheetRows(rows => {
      const newRows = [...rows];
      results.forEach(res => {
        const rowIndex = res.rowIndex;
        const targetRowIndex = newRows.findIndex(r => r.rowIndex === rowIndex);
        if (targetRowIndex !== -1) {
          if (res.error) {
            newRows[targetRowIndex].error = res.error;
          } else {
            newRows[targetRowIndex].ragResult = res.result as TalkResult;
          }
          newRows[targetRowIndex].isGenerating = false;
        }
      });
      return newRows;
    });
  };

  return (
    <main>
      {/* Hero */}
      <section className="relative min-h-[100svh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-center bg-cover pointer-events-none" style={{ backgroundImage: "url(/top1.png)" }}></div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#0b1020]/40 to-[#0b1020] pointer-events-none"></div>
        <div className="relative z-30 text-center space-y-5">
          <p className="text-white/70 text-sm tracking-widest">Data analytics to change the world for the better</p>
          <h1 className="text-3xl md:text-5xl font-bold [font-family:var(--font-serif-jp)]">データ解析で、<br className="md:hidden"/>営業をよりよく変える</h1>
          <button type="button" onClick={handleReadSheet} disabled={isLoading} className="mt-2 px-6 py-3 bg-blue-600 text-white rounded-md text-lg disabled:bg-gray-600 cursor-pointer hover:bg-blue-500 transition">
            {isLoading ? '読込中...' : '一括読み込み実行'}
          </button>
          {globalError && (
            <p className="text-red-300 bg-red-900/30 border border-red-800 inline-block px-3 py-2 rounded-md">Error: {globalError}</p>
          )}
        </div>
      </section>

      {/* Actions (error only) */}
      <section className="container mx-auto px-4 -mt-8 relative z-20">
        {globalError && <p className="text-red-400 bg-red-900/30 border border-red-800 p-3 rounded-md mb-4">Error: {globalError}</p>}
      </section>

      {/* Results */}
      {sheetRows.length > 0 && (
        <section ref={resultsRef} className="relative py-10">
          <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: 'url(/top1.png)' }}></div>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#0b1020]/80 to-[#0b1020]"></div>
          <div className="relative container mx-auto px-4">
            <div className="bg-white/95 text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 backdrop-blur-sm">
              <h2 className="text-4xl font-bold [font-family:var(--font-serif-jp)] text-slate-900 tracking-wide">RESULTS</h2>
              <div className="mt-6 flex justify-end">
                <button onClick={handleGenerateAllTalks} className="px-4 py-2 bg-orange-500 text-white rounded-md disabled:bg-gray-400">全件一括生成</button>
              </div>
              <div className="mt-6 space-y-4">
                {sheetRows.map((row) => (
                  <div key={row.rowIndex} className="p-4 border border-white/10 rounded-md shadow-sm bg-white/5">
                    <h3 className="font-bold text-lg [font-family:var(--font-serif-jp)]">SSリスクシート {row.rowIndex}行目</h3>
                    {row.error ? (
                      <p className="text-red-300">エラー: {row.error}</p>
                    ) : row.data && (
                      <div className="mt-2 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                            <div><span className="font-semibold">代表者:</span> {row.data.representative}</div>
                            <div><span className="font-semibold">住所:</span> {row.data.address}</div>
                            <div><span className="font-semibold">従業員数:</span> {row.data.employees}</div>
                            <div><span className="font-semibold">設立年:</span> {row.data.founded}</div>
                            <div className="col-span-2"><span className="font-semibold">Webサイト:</span> <a href={row.data.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{row.data.website}</a></div>
                            <div className="col-span-2"><span className="font-semibold">事業内容:</span> {row.data.businessInfo}</div>
                            <div className="col-span-2"><span className="font-semibold">マーケティング目的:</span> {row.data.marketingPurpose}</div>
                        </div>
                        <div className="space-y-2">
                            <details className="p-2 border border-gray-200 rounded bg-gray-50">
                                <summary className="font-semibold cursor-pointer">各種トークスクリプト</summary>
                                <div className="mt-2 space-y-2 text-xs p-2 rounded">
                                    <h5 className="font-semibold">受付突破</h5><p className="whitespace-pre-wrap">{row.data.receptionistTalk}</p>
                                    <h5 className="font-semibold mt-2">対象者通話</h5><p className="whitespace-pre-wrap">{row.data.targetTalk}</p>
                                    <h5 className="font-semibold mt-2">ヒアリング</h5><p className="whitespace-pre-wrap">{row.data.hearingTalk}</p>
                                    <h5 className="font-semibold mt-2">クロージング</h5><p className="whitespace-pre-wrap">{row.data.closingTalk}</p>
                                    <h5 className="font-semibold mt-2">アポイント確認</h5><p className="whitespace-pre-wrap">{row.data.apptConfirmationTalk}</p>
                                </div>
                            </details>
                        </div>
                        {!row.ragResult ? (
                            <button onClick={() => handleGenerateTalk(row.rowIndex)} disabled={row.isGenerating} className="mt-2 px-4 py-2 bg-green-600 text-white rounded-md disabled:bg-gray-600">
                                {row.isGenerating ? 'AI改善案を生成中...' : 'AI改善案を生成'}
                            </button>
                        ) : (
                        <div className="mt-4 space-y-3">
                          {[...row.ragResult.results]
                            .sort((a, b) => getTalkOrderIndex(a.talk_type) - getTalkOrderIndex(b.talk_type))
                            .map((it, idx) => (
                            <div key={idx} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <h4 className="font-bold text-lg text-yellow-800">{it.talk_type}</h4>
                              <p className="mt-1 font-semibold">改善理由:</p>
                              <p className="text-sm p-2 bg-yellow-50 rounded">{it.reason}</p>
                              <p className="mt-2 font-semibold">改善トーク案:</p>
                              <p className="text-sm p-2 bg-yellow-50 rounded whitespace-pre-wrap">{it.improved_talk}</p>
                            </div>
                          ))}
                        </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* About/Solution style sections could be added here if needed */}
    </main>
  );
}

