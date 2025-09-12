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

interface ChallengeCompany {
  rowIndex: number;
  date: string;
  companyName: string;
  originalCompanyName: string;
  challenges: any;
  matches: MatchingResult[];
  totalMatches: number;
  sourceUrl: string;
  success: boolean;
  sheetName?: string; // シート名を追加
  filterStats?: any;
  error?: string;
}

interface DateOption {
  rowIndex: number;
  date: string;
  url: string;
  displayDate: string;
  status?: string;
}

interface CompanyByDate {
  columnIndex: number;
  subIndex?: number;
  companyName: string;
  columnLetter?: string;
  originalTitle?: string;
  meetingType?: string;
  confidence?: number;
  conversationData: string;
  conversationLength: number;
  conversationLines: number;
  sourceUrl: string;
  date: string;
  sheetName?: string; // シート名を追加
  isExtractedFromConversation?: boolean;
  extractionMethod?: string;
  isProcessing?: boolean;
  isProcessed?: boolean;
  error?: string;
  processingResult?: any;
  // 課題抽出・マッチング用の状態
  isChallengeProcessing?: boolean;
  isChallengeProcessed?: boolean;
  challengeError?: string;
  challengeResult?: any;
}

function toMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

export default function Home() {
  // 処理1用：取材シート（企業情報保存のみ）
  const [masterUrl] = useState('https://docs.google.com/spreadsheets/d/1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY/edit?gid=1747100300#gid=1747100300');
  // 処理2用：CLシート（課題抽出・マッチング）
  const [challengeSheetUrl] = useState('https://docs.google.com/spreadsheets/d/1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY/edit?gid=0#gid=0');
  
  // シートタイプに応じたURLを取得する関数
  const getSheetUrlByType = (sheetType: 'CL' | 'CU' | 'CP'): string => {
    const baseUrl = 'https://docs.google.com/spreadsheets/d/1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY/edit?pli=1';
    let url: string;
    let gid: string;
    
    switch (sheetType) {
      case 'CL':
        gid = '0';
        url = `${baseUrl}&gid=${gid}#gid=${gid}`;
        break;
      case 'CU':
        gid = '609102789';
        url = `${baseUrl}&gid=${gid}#gid=${gid}`;
        break;
      case 'CP':
        gid = '1336297365';
        url = `${baseUrl}&gid=${gid}#gid=${gid}`;
        break;
      default:
        url = challengeSheetUrl;
        gid = 'default';
    }
    
    console.log(`📊 シートタイプ: ${sheetType} | GID: ${gid} | URL: ${url}`);
    return url;
  };
  const [companyData, setCompanyData] = useState<CompanyData[]>([]);
  const [processedCompanies, setProcessedCompanies] = useState<ProcessedCompany[]>([]);
  const [challengeCompanies, setChallengeCompanies] = useState<ChallengeCompany[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isChallengeLoading, setIsChallengeLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [challengeError, setChallengeError] = useState('');
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  
  // 新しい日付選択機能用のstate（取材シート）
  const [availableDates, setAvailableDates] = useState<DateOption[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [companiesByDate, setCompaniesByDate] = useState<CompanyByDate[]>([]);
  const [isDateLoading, setIsDateLoading] = useState(false);
  const [isCompanyLoading, setIsCompanyLoading] = useState(false);
  const [dateError, setDateError] = useState('');
  const [selectedCompanyIndex, setSelectedCompanyIndex] = useState<number | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // CLシート用の日付選択機能のstate
  const [clAvailableDates, setClAvailableDates] = useState<DateOption[]>([]);
  const [clSelectedDate, setClSelectedDate] = useState<string>('');
  const [selectedSheetType, setSelectedSheetType] = useState<'CL' | 'CU' | 'CP'>('CL');
  
  // スプレッドシート書き込み用の状態
  const [isWritingToSheet, setIsWritingToSheet] = useState(false);
  const [writeSheetError, setWriteSheetError] = useState('');
  const [clCompaniesByDate, setClCompaniesByDate] = useState<CompanyByDate[]>([]);
  const [isClDateLoading, setIsClDateLoading] = useState(false);
  const [isClCompanyLoading, setIsClCompanyLoading] = useState(false);
  const [clDateError, setClDateError] = useState('');
  const [selectedClCompanyIndex, setSelectedClCompanyIndex] = useState<number | null>(null);

  // ペルソナ抽出機能用の状態
  const [isPersonaProcessing, setIsPersonaProcessing] = useState(false);
  const [personaResults, setPersonaResults] = useState<any>(null);
  const [personaError, setPersonaError] = useState('');

  const resultsRef = useRef<HTMLDivElement | null>(null);
  const challengeResultsRef = useRef<HTMLDivElement | null>(null);
  const dateCompaniesRef = useRef<HTMLDivElement | null>(null);

  const handleReadSheet = async () => {
    await handleReadSheetInternal();
  };

  // ペルソナ強化版処理を実行
  const handlePersonaEnhancedProcessing = async (company: CompanyByDate) => {
    if (!company.conversationData) {
      setPersonaError('会話データがありません');
      return;
    }

    setIsPersonaProcessing(true);
    setPersonaError('');
    setPersonaResults(null);

    try {
      console.log('ペルソナ強化版処理開始:', company.companyName);
      
      const response = await fetch('/api/process/persona-enhanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyName: company.companyName,
          conversationData: company.conversationData,
          sourceUrl: company.sourceUrl,
          originalCompanyName: company.originalTitle,
          serviceName: '未指定', // 必要に応じて入力フィールドを追加
          extractCompanyInfo: true
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ペルソナ強化版処理に失敗しました');
      }

      const result = await response.json();
      setPersonaResults(result);
      console.log('ペルソナ強化版処理完了:', result);
      
    } catch (error) {
      console.error('ペルソナ強化版処理エラー:', error);
      setPersonaError(toMessage(error));
    } finally {
      setIsPersonaProcessing(false);
    }
  };

  // 選択した日付の全企業を一括でデータベースに保存
  const handleBulkRegisterByDate = async () => {
    if (companiesByDate.length === 0) return;
    setIsBulkProcessing(true);
    setDateError('');

    try {
      for (const company of companiesByDate) {
        // 既に処理済み/処理中の企業はスキップ
        if (company.isProcessed || company.isProcessing) continue;
        await handleProcessSingleCompany(company);
        // API負荷軽減のための短い待機
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err: unknown) {
      setDateError(toMessage(err));
    } finally {
      setIsBulkProcessing(false);
    }
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

  // 企業情報保存のみの処理
  const handleStoreOnlyProcess = async () => {
    setIsLoading(true);
    setGlobalError('');
    
    try {
      const validCompanies = companyData.filter(c => !c.error);
      
      for (const company of validCompanies) {
        setProcessedCompanies(prev => [...prev.filter(p => p.rowIndex !== company.rowIndex), {
          rowIndex: company.rowIndex,
          companyName: company.companyName,
          extractedChallenges: [],
          challenges: { challenges: [], summary: '' },
          matches: [],
          totalMatches: 0,
          isProcessing: true,
        }]);

        try {
          const res = await fetch('/api/process/snowflake-store-only', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyName: company.companyName,
              conversationData: company.conversationData,
              sourceUrl: company.sheetUrl,
              originalCompanyName: company.companyName
            }),
          });

          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Failed to store company data');

          setProcessedCompanies(prev => 
            prev.map(p => p.rowIndex === company.rowIndex ? {
              ...p,
              extractedChallenges: result.extractedChallenges || [],
              challenges: result.challenges || { challenges: [], summary: '' },
              matches: [],
              totalMatches: 0,
              isProcessing: false,
            } : p)
          );

        } catch (err: unknown) {
          setProcessedCompanies(prev => 
            prev.map(p => p.rowIndex === company.rowIndex ? {
              ...p,
              isProcessing: false,
              error: toMessage(err),
            } : p)
          );
        }

        // API制限対策
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (err: unknown) {
      setGlobalError(toMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 日付一覧を取得
  const handleLoadDates = async () => {
    setIsDateLoading(true);
    setDateError('');
    setAvailableDates([]);
    
    try {
      console.log('日付一覧取得開始');
      
      const res = await fetch('/api/sheets/get-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: masterUrl, sheetType: '取材' }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to load dates');

      console.log('日付一覧取得完了:', result);
      setAvailableDates(result.dates || []);

    } catch (err: unknown) {
      setDateError(toMessage(err));
      console.error('日付一覧取得エラー:', err);
    } finally {
      setIsDateLoading(false);
    }
  };

  // 選択した日付の企業一覧を取得
  const handleLoadCompaniesByDate = async (date: string) => {
    if (!date) return;
    
    setIsCompanyLoading(true);
    setDateError('');
    setCompaniesByDate([]);
    
    try {
      console.log(`${date}の企業一覧取得開始`);
      
      const selectedDateOption = availableDates.find(d => d.date === date);
      if (!selectedDateOption) {
        throw new Error('選択された日付の情報が見つかりません');
      }

      const res = await fetch('/api/sheets/get-companies-by-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date: date,
          url: selectedDateOption.url
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to load companies');

      console.log('企業一覧取得完了:', result);
      setCompaniesByDate(result.companies || []);

      // 結果セクションにスクロール
      if (dateCompaniesRef.current) {
        setTimeout(() => {
          dateCompaniesRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }

    } catch (err: unknown) {
      setDateError(toMessage(err));
      console.error('企業一覧取得エラー:', err);
    } finally {
      setIsCompanyLoading(false);
    }
  };

  // CLシート用：利用可能な日付を読み込み
  const handleLoadClDates = async () => {
    setIsClDateLoading(true);
    setClDateError('');
    setClAvailableDates([]);
    
    try {
      console.log(`${selectedSheetType}シート日付一覧取得開始`);
      
      // シートタイプに応じて適切なAPIエンドポイントを選択
      const apiEndpoint = selectedSheetType === 'CL' ? '/api/sheets/get-cl-dates' :
                         selectedSheetType === 'CU' ? '/api/sheets/get-cu-dates' :
                         '/api/sheets/get-cp-dates';
      
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: getSheetUrlByType(selectedSheetType)
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Failed to load ${selectedSheetType} dates`);

      console.log(`${selectedSheetType}シート日付一覧取得完了:`, result);
      setClAvailableDates(result.dates || []);

    } catch (err: unknown) {
      setClDateError(toMessage(err));
      console.error(`${selectedSheetType}シート日付一覧取得エラー:`, err);
    } finally {
      setIsClDateLoading(false);
    }
  };

  // CLシート用：指定日付の企業データを読み込み
  const handleLoadClCompaniesByDate = async () => {
    if (!clSelectedDate) {
      setClDateError('日付を選択してください');
      return;
    }

    const selectedDateData = clAvailableDates.find(d => d.date === clSelectedDate);
    if (!selectedDateData) {
      setClDateError('選択された日付のデータが見つかりません');
      return;
    }

    setIsClCompanyLoading(true);
    setClDateError('');
    setClCompaniesByDate([]);

    try {
      console.log(`${selectedSheetType}シート企業データ取得開始: ${clSelectedDate}`);
      
      // シートタイプに応じて適切なAPIエンドポイントを選択
      const apiEndpoint = selectedSheetType === 'CL' ? '/api/sheets/get-cl-companies-by-date' :
                         selectedSheetType === 'CU' ? '/api/sheets/get-cu-companies-by-date' :
                         '/api/sheets/get-cp-companies-by-date';
      
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date: clSelectedDate,
          url: selectedDateData.url
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Failed to load ${selectedSheetType} companies`);

      console.log(`${selectedSheetType}シート企業データ取得完了:`, result);
      
      // CompanyByDate形式に変換
      const companies: CompanyByDate[] = result.companies.map((company: any, index: number) => ({
        companyName: company.companyName,
        columnIndex: company.columnIndex,
        columnLetter: company.columnLetter,
        conversationData: company.conversationData,
        conversationLength: company.conversationData?.length || 0,
        sheetName: result.sheetName || clSelectedDate, // シート名を追加
        conversationLines: (company.conversationData?.split('\n') || []).length,
        sourceUrl: selectedDateData.url,
        date: clSelectedDate,
        subIndex: index,
        originalTitle: company.originalTitle,
        meetingType: company.meetingType,
        confidence: company.confidence,
        isExtractedFromConversation: company.isExtractedFromConversation,
        extractionMethod: company.extractionMethod
      }));

      setClCompaniesByDate(companies);

    } catch (err: unknown) {
      setClDateError(toMessage(err));
      console.error(`${selectedSheetType}シート企業データ取得エラー:`, err);
    } finally {
      setIsClCompanyLoading(false);
    }
  };

  // CLシート用：指定日付の課題抽出・マッチング処理（全企業並行処理）
  const handleProcessClByDate = async () => {
    if (!clSelectedDate) {
      setChallengeError('日付を選択してください');
      return;
    }

    const selectedDateData = clAvailableDates.find(d => d.date === clSelectedDate);
    if (!selectedDateData) {
      setChallengeError('選択された日付のデータが見つかりません');
      return;
    }

    setIsChallengeLoading(true);
    setChallengeError('');
    setChallengeCompanies([]);

    try {
      console.log(`指定日付の課題抽出・マッチング処理開始: ${clSelectedDate}`);
      
      // まず企業データを取得
      const apiEndpoint = selectedSheetType === 'CL' ? '/api/sheets/get-cl-companies-by-date' :
                         selectedSheetType === 'CU' ? '/api/sheets/get-cu-companies-by-date' :
                         '/api/sheets/get-cp-companies-by-date';
      
      const companiesRes = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date: clSelectedDate,
          url: selectedDateData.url
        }),
      });

      const companiesResult = await companiesRes.json();
      if (!companiesRes.ok) throw new Error(companiesResult.error || 'Failed to load companies');

      const companies = companiesResult.companies || [];
      console.log(`取得した企業数: ${companies.length}社`);

      // テスト用：最初の2社のみ処理
      const testCompanies = companies.slice(0, 2);
      console.log(`テスト用：${testCompanies.length}社を並行処理します`);

      // 各企業を並行処理
      const processPromises = testCompanies.map(async (company: any, index: number) => {
        try {
          console.log(`企業${index + 1}の処理開始: ${company.companyName}`);
          
          const res = await fetch('/api/process/single-challenge-matching', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyName: company.companyName,
              conversationData: company.conversationData,
              columnLetter: company.columnLetter,
              extractionMethod: company.extractionMethod,
              sheetType: selectedSheetType
            }),
          });

          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Failed to process company');

          console.log(`企業${index + 1}の処理完了: ${company.companyName}`);
          return result;
        } catch (error) {
          console.error(`企業${index + 1}の処理エラー: ${company.companyName}`, error);
          return {
            error: error instanceof Error ? error.message : String(error),
            companyName: company.companyName
          };
        }
      });

      // 全企業の処理を待機
      const results = await Promise.all(processPromises);
      console.log('全企業の並行処理完了:', results);

      // ChallengeCompany形式に変換
      const cc: ChallengeCompany[] = results.map((result: any, idx: number) => {
        if (result.error) {
          return {
            rowIndex: idx + 1,
            date: clSelectedDate,
            companyName: result.companyName,
            originalCompanyName: result.companyName,
            challenges: { challenges: [], summary: '' },
            matches: [],
            totalMatches: 0,
            sourceUrl: selectedDateData.url,
            sheetName: selectedSheetType,
            success: false,
            error: result.error
          };
        }

        const flatMatches: MatchingResult[] = result.comprehensiveMatches || [];
        const totalMatches = flatMatches.length;

        return {
          rowIndex: idx + 1,
          date: clSelectedDate,
          companyName: result.companyName,
          originalCompanyName: result.originalCompanyName ?? result.companyName,
          challenges: result.challenges,
          matches: flatMatches,
          totalMatches,
          sourceUrl: selectedDateData.url,
          sheetName: selectedSheetType,
          success: !result.error,
          error: result.error,
          filterStats: result.filterStats
        };
      });

      setChallengeCompanies(cc);
      console.log(`✅ 課題抽出・マッチング完了: ${cc.length}社処理（テスト用）`);

      // 結果セクションまでスクロール
      if (challengeResultsRef.current) {
        setTimeout(() => {
          challengeResultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }

    } catch (err: unknown) {
      setChallengeError(toMessage(err));
      console.error('指定日付の課題抽出・マッチング処理エラー:', err);
    } finally {
      setIsChallengeLoading(false);
    }
  };

  // CLシート用：個別企業の課題抽出・マッチング処理
  const handleProcessSingleClCompany = async (company: CompanyByDate) => {
    // 一意なキーを作成（columnIndex + subIndex）
    const companyKey = `${company.columnIndex}-${company.subIndex || 0}`;
    
    setClCompaniesByDate(prev => 
      prev.map(c => {
        const currentKey = `${c.columnIndex}-${c.subIndex || 0}`;
        return currentKey === companyKey 
          ? { ...c, isChallengeProcessing: true, challengeError: undefined }
          : c;
      })
    );

    try {
      console.log(`${company.companyName}の課題抽出・マッチング処理開始`);
      
      const res = await fetch('/api/process/single-challenge-matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.companyName,
          conversationData: company.conversationData,
          columnLetter: company.columnLetter,
          extractionMethod: company.extractionMethod,
          sheetType: selectedSheetType, // シートタイプを追加
          // デフォルトフィルターがAPIで自動適用されるため、excludeSpeakersは不要
          includeSpeakers: [], // 必要に応じて実装
          excludeKeywords: [] // 必要に応じて実装
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to process challenge matching');

      console.log(`${company.companyName}の課題抽出・マッチング処理完了:`, result);

      setClCompaniesByDate(prev => 
        prev.map(c => {
          const currentKey = `${c.columnIndex}-${c.subIndex || 0}`;
          return currentKey === companyKey 
            ? { 
                ...c, 
                isChallengeProcessing: false, 
                isChallengeProcessed: true,
                challengeResult: {
                  ...result,
                  sheetType: result.sheetType || selectedSheetType
                }
              }
            : c;
        })
      );

    } catch (err: unknown) {
      const errorMessage = toMessage(err);
      console.error(`${company.companyName}の課題抽出・マッチング処理エラー:`, err);
      
      setClCompaniesByDate(prev => 
        prev.map(c => {
          const currentKey = `${c.columnIndex}-${c.subIndex || 0}`;
          return currentKey === companyKey 
            ? { 
                ...c, 
                isChallengeProcessing: false, 
                challengeError: errorMessage 
              }
            : c;
        })
      );
    }
  };

  // 個別企業のデータベース保存処理
  const handleProcessSingleCompany = async (company: CompanyByDate) => {
    // 一意なキーを作成（columnIndex + subIndex）
    const companyKey = `${company.columnIndex}-${company.subIndex || 0}`;
    
    setCompaniesByDate(prev => 
      prev.map(c => {
        const currentKey = `${c.columnIndex}-${c.subIndex || 0}`;
        return currentKey === companyKey 
          ? { ...c, isProcessing: true, error: undefined }
          : c;
      })
    );

    try {
      console.log(`${company.companyName}の処理開始`);
      
      // 新しい強化版APIを使用
      const res = await fetch('/api/process/enhanced-company-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.companyName,
          conversationData: company.conversationData,
          sourceUrl: company.sourceUrl,
          originalCompanyName: company.originalTitle || company.companyName,
          confidence: company.confidence,
          meetingType: company.meetingType,
          isExtractedFromConversation: company.isExtractedFromConversation || false
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to process company');

      console.log(`${company.companyName}の処理完了:`, result);
      
      setCompaniesByDate(prev => 
        prev.map(c => {
          const currentKey = `${c.columnIndex}-${c.subIndex || 0}`;
          return currentKey === companyKey 
            ? { ...c, isProcessing: false, isProcessed: true, processingResult: result }
            : c;
        })
      );

    } catch (err: unknown) {
      const errorMessage = toMessage(err);
      console.error(`${company.companyName}の処理エラー:`, err);
      
      setCompaniesByDate(prev => 
        prev.map(c => {
          const currentKey = `${c.columnIndex}-${c.subIndex || 0}`;
          return currentKey === companyKey 
            ? { ...c, isProcessing: false, error: errorMessage }
            : c;
        })
      );
    }
  };

  // 課題抽出とマッチング処理
  const handleChallengeMatching = async () => {
    setIsChallengeLoading(true);
    setChallengeError('');
    setChallengeCompanies([]);
    
    try {
      console.log('課題抽出とマッチング処理開始');
      
      const res = await fetch('/api/process/challenge-matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterSheetUrl: challengeSheetUrl
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to process challenge matching');

      console.log('課題抽出とマッチング処理完了:', result);
      setChallengeCompanies(result.processedCompanies || []);

      // 結果セクションにスクロール
      if (challengeResultsRef.current) {
        setTimeout(() => {
          challengeResultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }

    } catch (err: unknown) {
      setChallengeError(toMessage(err));
      console.error('課題抽出とマッチング処理エラー:', err);
    } finally {
      setIsChallengeLoading(false);
    }
  };

  // スプレッドシートに結果を書き込む関数
  const handleWriteResultsToSheet = async () => {
    if (challengeCompanies.length === 0) {
      setWriteSheetError('書き込む結果がありません');
      return;
    }

    setIsWritingToSheet(true);
    setWriteSheetError('');

    try {
      console.log('スプレッドシートへの結果書き込み開始');
      
      // 結果をスプレッドシート用の形式に変換（新しい形式）
      const results = challengeCompanies.flatMap(company => {
        const excludedSpeakers = company.filterStats?.excludedSpeakers?.join(', ') || '';
        const challenges = company.challenges || [];
        const matches = company.matches || company.comprehensiveMatches || [];

        if (challenges.length === 0) {
          return [{
            sheetName: company.sheetName || company.date,
            companyName: company.companyName,
            challenge: '課題が抽出されませんでした',
            excludedSpeakers,
            matches: matches,
            comprehensiveMatches: matches
          }];
        }

        return challenges.map((challenge: string) => ({
          sheetName: company.sheetName || company.date,
          companyName: company.companyName,
          challenge: challenge,
          excludedSpeakers,
          matches: matches,
          comprehensiveMatches: matches
        }));
      });

      const res = await fetch('/api/sheets/write-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://docs.google.com/spreadsheets/d/1jiead_e52qCXW2zU0ohqJwLqdbb2OyhpAg1urVJEVCY/edit?usp=sharing',
          results
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to write results to spreadsheet');

      console.log('スプレッドシートへの結果書き込み完了:', result);
      alert(`${result.updatedRows}行の結果をスプレッドシートに書き込みました`);

    } catch (err: unknown) {
      const errorMessage = toMessage(err);
      setWriteSheetError(errorMessage);
      console.error('スプレッドシート書き込みエラー:', err);
    } finally {
      setIsWritingToSheet(false);
    }
  };

  const handleWriteSingleResultToSheet = async (company: CompanyByDate) => {
    if (!company.challengeResult) {
      setWriteSheetError('書き込む結果がありません');
      return;
    }

    setIsWritingToSheet(true);
    setWriteSheetError('');

    try {
      console.log('単体企業のスプレッドシートへの結果書き込み開始');
      
      const result = company.challengeResult;
      const excludedSpeakers = result.filterStats?.excludedSpeakers?.join(', ') || '';
      const matches = result.comprehensiveMatches || result.matches || [];

      let dataToWrite;

      if (!result.challenges || result.challenges.length === 0) {
        dataToWrite = [{
          sheetName: company.sheetName || company.date,
          companyName: company.companyName,
          challenge: '課題が抽出されませんでした',
          excludedSpeakers,
          matches: matches,
          comprehensiveMatches: matches
        }];
      } else {
        dataToWrite = result.challenges.map((challenge: string) => ({
          sheetName: company.sheetName || company.date,
          companyName: company.companyName,
          challenge: challenge,
          excludedSpeakers,
          matches: matches,
          comprehensiveMatches: matches
        }));
      }

      const res = await fetch('/api/sheets/write-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://docs.google.com/spreadsheets/d/1jiead_e52qCXW2zU0ohqJwLqdbb2OyhpAg1urVJEVCY/edit?usp=sharing',
          results: dataToWrite
        }),
      });

      const apiResult = await res.json();
      if (!res.ok) throw new Error(apiResult.error || 'Failed to write results to spreadsheet');

      console.log('スプレッドシートへの結果書き込み完了:', apiResult);
      alert(`${apiResult.updatedRows}行の結果をスプレッドシートに書き込みました`);

    } catch (err: unknown) {
      const errorMessage = toMessage(err);
      setWriteSheetError(errorMessage);
      console.error('スプレッドシート書き込みエラー:', err);
    } finally {
      setIsWritingToSheet(false);
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
          <p className="text-white/90 text-sm md:text-base mb-4">
            処理1：取材シートからの企業情報保存 | 処理2：CL,CU,CPシートからの課題抽出・マッチング
          </p>
          {globalError && (
            <p className="text-red-300 bg-red-900/30 border border-red-800 inline-block px-3 py-2 rounded-md">Error: {globalError}</p>
          )}
        </div>
      </section>

      {/* Actions (error only) */}
      <section className="container mx-auto px-4 -mt-8 relative z-20">
        {globalError && <p className="text-red-400 bg-red-900/30 border border-red-800 p-3 rounded-md mb-4">Error: {globalError}</p>}
      </section>

      {/* 新しい日付選択セクション */}
      <section className="relative py-10">
        <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: 'url(/top1.png)' }}></div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#0b1020]/80 to-[#0b1020]"></div>
        <div className="relative container mx-auto px-4">
          <div className="bg-white/95 text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 backdrop-blur-sm">
            <h2 className="text-4xl font-bold [font-family:var(--font-serif-jp)] text-slate-900 tracking-wide mb-4">取材の会話データから企業情報をデータベースに登録（取材シート）</h2>
            <p className="text-gray-600 mb-6">
              取材シートから日付を選択し、その日の企業別会話データを個別に処理できます。
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <button 
                onClick={handleLoadDates} 
                disabled={isDateLoading}
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition"
              >
                {isDateLoading ? '日付読込中...' : '利用可能な日付を読み込み'}
              </button>
              
              {availableDates.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      if (e.target.value) {
                        handleLoadCompaniesByDate(e.target.value);
                      }
                    }}
                    disabled={isCompanyLoading}
                    className="px-3 py-3 border border-gray-300 rounded-md text-center disabled:bg-gray-100"
                  >
                    <option value="">日付を選択</option>
                    {availableDates.map((dateOption) => (
                      <option key={dateOption.date} value={dateOption.date}>
                        {dateOption.displayDate}
                      </option>
                    ))}
                  </select>
                  {isCompanyLoading && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                      <span className="text-sm">企業データ読込中...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {dateError && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200 mb-6">
                <p className="text-red-700">エラー: {dateError}</p>
              </div>
            )}

            {availableDates.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">
                  📅 利用可能な日付: {availableDates.length}件
                  {selectedDate && (
                    <span className="ml-2 font-medium text-blue-600">
                      選択中: {selectedDate}
                    </span>
                  )}
                </p>
              </div>
            )}

            {companiesByDate.length > 0 && (
              <div ref={dateCompaniesRef} className="mt-6">
                <h2 className="text-4xl font-bold [font-family:var(--font-serif-jp)] text-slate-900 tracking-wide mb-6">
                  {selectedDate}の企業データ ({companiesByDate.length}社)
                </h2>
                
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">処理対象企業:</label>
                      <select
                        value={selectedCompanyIndex ?? ''}
                        onChange={(e) => setSelectedCompanyIndex(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">企業を選択してください</option>
                        {companiesByDate.map((company, index) => (
                          <option key={`${company.columnIndex}-${company.subIndex || index}`} value={index}>
                            {company.companyName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        if (selectedCompanyIndex !== null) {
                          handlePersonaEnhancedProcessing(companiesByDate[selectedCompanyIndex]);
                        }
                      }}
                      disabled={selectedCompanyIndex === null || isPersonaProcessing}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 transition"
                      title="ペルソナ抽出 + ターゲット検索（新機能）"
                    >
                      {isPersonaProcessing ? 'ペルソナ処理中...' : 'ペルソナ抽出'}
                    </button>
                    <button
                      onClick={handleBulkRegisterByDate}
                      disabled={isBulkProcessing || companiesByDate.every(c => c.isProcessed || c.isProcessing)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 transition"
                      title="表示中の全企業をまとめて登録"
                    >
                      {isBulkProcessing ? '一括登録中...' : '一括登録'}
                    </button>
                  </div>
                  <div className="text-sm text-gray-600">
                    進捗: {companiesByDate.filter(c => c.isProcessed).length}/{companiesByDate.length} 社 登録済み
                  </div>
                  {selectedCompanyIndex !== null && companiesByDate[selectedCompanyIndex]?.error && (
                    <div className="bg-red-50 p-3 rounded border border-red-200 mb-4">
                      <p className="text-red-700 text-sm">エラー: {companiesByDate[selectedCompanyIndex].error}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>{/* .bg-white/95 card */}
        </div>{/* .container */}
      </section>{/* 新しい日付選択セクション */}

      {/* Company Data Display */}
      {companyData.length > 0 && (
        <section ref={resultsRef} className="relative py-10">
          <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: 'url(/top1.png)' }}></div>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#0b1020]/80 to-[#0b1020]"></div>
          <div className="relative container mx-auto px-4">
            <div className="bg-white/95 text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 backdrop-blur-sm">
              <h2 className="text-4xl font-bold [font-family:var(--font-serif-jp)] text-slate-900 tracking-wide">企業データ処理（取材シート）</h2>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button 
                  onClick={handleStoreOnlyProcess} 
                  disabled={isLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition"
                  title="企業情報をデータベースに保存のみ（マッチングなし）"
                >
                  {isLoading ? '保存中...' : '企業情報保存のみ'}
                </button>

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
                                        
                                        {/* 解決できる課題の表示 */}
                                        {match.challenge && (
                                          <div className="mb-2">
                                            <p className="text-xs font-semibold text-gray-700 mb-1">解決できる課題:</p>
                                            <div className="text-xs text-gray-600">
                                              {(() => {
                                                // 課題のタイトル部分を抽出（**課題名**: の形式から）
                                                const challengeText = match.challenge;
                                                const titleMatch = challengeText.match(/\*\*(.*?)\*\*:/);
                                                if (titleMatch) {
                                                  return <p>・{titleMatch[1]}</p>;
                                                }
                                                // マッチしない場合は最初の部分を表示
                                                return <p>・{challengeText.split(':')[0] || challengeText}</p>;
                                              })()}
                                            </div>
                                          </div>
                                        )}
                                        
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

      {/* 課題抽出・マッチング処理セクション */}
      <section className="relative py-10">
        <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: 'url(/top1.png)' }}></div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#0b1020]/80 to-[#0b1020]"></div>
        <div className="relative container mx-auto px-4">
          <div className="bg-white/95 text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 backdrop-blur-sm">
            <h2 className="text-4xl font-bold [font-family:var(--font-serif-jp)] text-slate-900 tracking-wide mb-4">課題抽出・マッチング処理（CL/CU/CPシート）</h2>
            <p className="text-gray-600 mb-6">
              CL/CU/CPシートから「会話データなし」以外の企業データを対象に、課題を抽出して既存企業とのマッチングを行います。
              <br />
              CLシート: <a href={getSheetUrlByType('CL')} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">リンク</a> | 
              CUシート: <a href={getSheetUrlByType('CU')} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">リンク</a> | 
              CPシート: <a href={getSheetUrlByType('CP')} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">リンク</a>
            </p>

            {/* CLシート用日付選択セクション */}
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200 mb-6">
              <h3 className="text-xl font-semibold text-slate-800 mb-4">日付選択による課題抽出・マッチング</h3>
              
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">シートタイプ:</label>
                    <select
                      value={selectedSheetType}
                      onChange={(e) => {
                        setSelectedSheetType(e.target.value as 'CL' | 'CU' | 'CP');
                        setClSelectedDate(''); // シートタイプ変更時に日付選択をリセット
                        setClAvailableDates([]); // 利用可能日付もリセット
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="CL">CLシート</option>
                      <option value="CU">CUシート</option>
                      <option value="CP">CPシート</option>
                    </select>
                  </div>
                  
                  <div>
                    <button 
                      onClick={handleLoadClDates}
                      disabled={isClDateLoading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition"
                    >
                      {isClDateLoading ? '読み込み中...' : `${selectedSheetType}シートの利用可能な日付を読み込み`}
                    </button>
                  </div>
                </div>

                {clAvailableDates.length > 0 && (
                  <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">処理対象日付:</label>
                      <select
                        value={clSelectedDate}
                        onChange={(e) => setClSelectedDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">日付を選択してください</option>
                        {clAvailableDates.map((dateOption) => (
                          <option key={dateOption.rowIndex} value={dateOption.date}>
                            {dateOption.displayDate} ({dateOption.status})
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <button 
                      onClick={handleLoadClCompaniesByDate}
                      disabled={!clSelectedDate || isClCompanyLoading}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition"
                    >
                      {isClCompanyLoading ? '読み込み中...' : '企業データを確認'}
                    </button>
                  </div>
                )}

                {clSelectedDate && (
                  <div className="mt-4">
                    <button 
                      onClick={handleProcessClByDate}
                      disabled={isChallengeLoading}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 transition"
                    >
                      {isChallengeLoading ? '処理中...' : `${clSelectedDate}${selectedSheetType}シート課題抽出・マッチング実行`}
                    </button>
                  </div>
                )}

                {clDateError && (
                  <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                    <p className="text-red-700">{clDateError}</p>
                  </div>
                )}
              </div>
            </div>

            {/* CLシート企業データ表示 */}
            {clCompaniesByDate.length > 0 && (
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                <h3 className="text-xl font-semibold text-slate-800 mb-4">
                  {clSelectedDate} の課題抽出対象企業（{clCompaniesByDate.length}社）
                </h3>
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">処理対象企業:</label>
                      <select
                        value={selectedClCompanyIndex ?? ''}
                        onChange={(e) => setSelectedClCompanyIndex(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">企業を選択してください</option>
                        {clCompaniesByDate.map((company, index) => (
                          <option key={`${company.columnIndex}-${company.subIndex || index}`} value={index}>
                            {company.companyName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        if (selectedClCompanyIndex !== null) {
                          handleProcessSingleClCompany(clCompaniesByDate[selectedClCompanyIndex]);
                        }
                      }}
                      disabled={selectedClCompanyIndex === null || clCompaniesByDate[selectedClCompanyIndex]?.isChallengeProcessing}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 transition"
                    >
                      {selectedClCompanyIndex !== null && clCompaniesByDate[selectedClCompanyIndex]?.isChallengeProcessing ? '処理中...' : '課題抽出・マッチング'}
                    </button>
                  </div>
                  {selectedClCompanyIndex !== null && clCompaniesByDate[selectedClCompanyIndex]?.challengeResult && (
                    <div className="bg-green-50 p-3 rounded-lg border border-green-200 mb-3">
                      <p className="text-xs font-semibold text-green-800 mb-1">処理完了</p>
                      <p className="text-xs text-green-700">
                        課題: {clCompaniesByDate[selectedClCompanyIndex].challengeResult.totalChallenges}件 | 
                        解決策: {clCompaniesByDate[selectedClCompanyIndex].challengeResult.comprehensiveMatches?.length || clCompaniesByDate[selectedClCompanyIndex].challengeResult.selectedCompaniesCount || clCompaniesByDate[selectedClCompanyIndex].challengeResult.totalMatches || 0}件
                      </p>
                    </div>
                  )}
                  {selectedClCompanyIndex !== null && clCompaniesByDate[selectedClCompanyIndex]?.challengeError && (
                    <div className="bg-red-50 p-2 rounded-lg border border-red-200 mb-3">
                      <p className="text-xs text-red-700">エラー: {clCompaniesByDate[selectedClCompanyIndex].challengeError}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            

          </div>
        </div>
      </section>

      {/* 個別課題抽出・マッチング結果表示 */}
      {clCompaniesByDate.some(c => c.challengeResult) && (
        <section className="relative py-10">
          <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: 'url(/top1.png)' }}></div>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#0b1020]/80 to-[#0b1020]"></div>
          <div className="relative container mx-auto px-4">
            <div className="bg-white/95 text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 backdrop-blur-sm">
              <h2 className="text-4xl font-bold [font-family:var(--font-serif-jp)] text-slate-900 tracking-wide mb-6">
                個別課題抽出・マッチング結果
              </h2>
              
              <div className="grid gap-6">
                {clCompaniesByDate
                  .filter(company => company.challengeResult)
                  .map((company, index) => (
                    <div key={`${company.columnIndex}-${company.subIndex || index}`} className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-2xl font-bold text-slate-800">{company.companyName}</h3>
                          <p className="text-sm text-gray-600">
                            {company.columnLetter}列 | {company.extractionMethod === 'ai_extraction' ? 'AI抽出' : 'ヘッダー'} | 
                            処理時刻: {company.challengeResult?.processedAt ? new Date(company.challengeResult.processedAt).toLocaleString() : '-'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-700">
                            課題: {company.challengeResult?.totalChallenges ?? 0}件
                          </p>
                          <p className="text-sm font-semibold text-gray-700">
                            解決策: {company.challengeResult?.comprehensiveMatches?.length || company.challengeResult?.selectedCompaniesCount || company.challengeResult?.totalMatches || 0}件
                          </p>
                          {company.challengeResult?.filterStats && (
                            <p className="text-xs text-gray-600 mt-1">
                              除外話者: {company.challengeResult.filterStats.excludedSpeakers?.length || 0}名
                            </p>
                          )}
                          <button
                            onClick={() => handleWriteSingleResultToSheet(company)}
                            disabled={isWritingToSheet}
                            className="mt-2 px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:bg-gray-400 transition"
                          >
                            {isWritingToSheet ? '書き込み中...' : 'シートに書き込み'}
                          </button>
                        </div>
                      </div>

                      {/* マッチング結果 */}
                      <div>
                        <h4 className="text-lg font-semibold text-slate-700 mb-2">
                          総合マッチング結果 ({company.challengeResult?.comprehensiveMatches?.length || company.challengeResult?.selectedCompaniesCount || 0}社の解決企業)
                        </h4>
                        <div className="space-y-3">
                          {/* 全課題の表示 */}
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-4">
                            <h5 className="font-semibold text-blue-800 mb-2">抽出された課題:</h5>
                            <div className="space-y-1">
                              {company.challengeResult?.challenges?.map((challenge: string, idx: number) => (
                                <div key={idx} className="text-sm text-blue-700">
                                  {idx + 1}. {challenge}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 総合マッチング企業の表示 */}
                          {company.challengeResult?.comprehensiveMatches && company.challengeResult.comprehensiveMatches.length > 0 ? (
                            company.challengeResult.comprehensiveMatches.map((match: any, matchIdx: number) => (
                              <div key={matchIdx} className="bg-green-50 p-4 rounded-lg border border-green-200">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center">
                                    <span className="bg-green-600 text-white text-xs px-2 py-1 rounded-full mr-2">
                                      {match.rank || matchIdx + 1}位
                                    </span>
                                    <h6 className="font-medium text-green-800">{match.company_name}</h6>
                                  </div>
                                  <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">
                                    総合スコア: {match.total_score?.toFixed(2) || 'N/A'}
                                  </span>
                                </div>
                                <p className="text-sm text-green-700 mb-2">{match.industry}</p>
                                <p className="text-sm text-gray-600 mb-2">{match.business_description}</p>
                                
                                {/* 解決できる課題の表示 */}
                                {match.challenge && (
                                  <div className="mb-2">
                                    <p className="text-xs font-semibold text-gray-700 mb-1">解決できる課題:</p>
                                    <div className="text-xs text-gray-600">
                                      {(() => {
                                        // 課題のタイトル部分を抽出（**課題名**: の形式から）
                                        const challengeText = match.challenge;
                                        const titleMatch = challengeText.match(/\*\*(.*?)\*\*:/);
                                        if (titleMatch) {
                                          return <p>・{titleMatch[1]}</p>;
                                        }
                                        // マッチしない場合は最初の部分を表示
                                        return <p>・{challengeText.split(':')[0] || challengeText}</p>;
                                      })()}
                                    </div>
                                  </div>
                                )}
                                
                                {/* 対応領域の表示 */}
                                {match.coverage_areas && (
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    <span className="text-xs px-2 py-1 rounded" style={{
                                      backgroundColor: match.coverage_areas.sales_acquisition ? '#dcfce7' : '#f3f4f6',
                                      color: match.coverage_areas.sales_acquisition ? '#166534' : '#6b7280'
                                    }}>
                                      営業・案件獲得 {match.coverage_areas.sales_acquisition ? '○' : '×'}
                                    </span>
                                    <span className="text-xs px-2 py-1 rounded" style={{
                                      backgroundColor: match.coverage_areas.marketing_strategy ? '#dcfce7' : '#f3f4f6',
                                      color: match.coverage_areas.marketing_strategy ? '#166534' : '#6b7280'
                                    }}>
                                      マーケティング戦略 {match.coverage_areas.marketing_strategy ? '○' : '×'}
                                    </span>
                                    <span className="text-xs px-2 py-1 rounded" style={{
                                      backgroundColor: match.coverage_areas.digital_performance ? '#dcfce7' : '#f3f4f6',
                                      color: match.coverage_areas.digital_performance ? '#166534' : '#6b7280'
                                    }}>
                                      デジタル・成果測定 {match.coverage_areas.digital_performance ? '○' : '×'}
                                    </span>
                                  </div>
                                )}

                                {/* 詳細スコア */}
                                {match.detailed_scores && (
                                  <div className="text-xs text-gray-600">
                                    <span>課題対応: {match.detailed_scores.multi_challenge_coverage?.toFixed(2)}</span>
                                    <span className="ml-2">業界適合: {match.detailed_scores.industry_fit?.toFixed(2)}</span>
                                    <span className="ml-2">総合支援: {match.detailed_scores.comprehensive_support?.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                              <p className="text-gray-500 text-sm text-center">
                                この課題群に対する解決企業は見つかりませんでした。
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 課題抽出・マッチング結果表示 */}
      {challengeCompanies.length > 0 && (
        <section ref={challengeResultsRef} className="relative py-10">
          <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: 'url(/top1.png)' }}></div>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#0b1020]/80 to-[#0b1020]"></div>
          <div className="relative container mx-auto px-4">
            <div className="bg-white/95 text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-4xl font-bold [font-family:var(--font-serif-jp)] text-slate-900 tracking-wide">課題抽出・マッチング結果（{selectedSheetType}シート）</h2>
                <button 
                  onClick={handleWriteResultsToSheet}
                  disabled={isWritingToSheet}
                  className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition"
                >
                  {isWritingToSheet ? '書き込み中...' : 'スプレッドシートに書き込み'}
                </button>
              </div>
              
              {writeSheetError && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                  エラー: {writeSheetError}
                </div>
              )}
              
              <div className="grid gap-6">
                {challengeCompanies.map((company, index) => {
                  const isSuccess = company.success && !company.error;
                  
                  return (
                    <div key={index} className={`p-6 rounded-lg border-2 ${
                      isSuccess ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                    }`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">
                            {company.companyName || company.originalCompanyName}
                          </h3>
                          <p className="text-gray-600">
                            行{company.rowIndex} | {company.date} | 
                            <a href={company.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                              スプレッドシート
                            </a>
                          </p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                          isSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {isSuccess ? `✓ ${company.totalMatches}件マッチ` : 'エラー'}
                        </div>
                      </div>

                      {company.error ? (
                        <div className="bg-red-100 p-3 rounded border border-red-200">
                          <p className="text-red-700">エラー: {company.error}</p>
                        </div>
                      ) : isSuccess ? (
                        <div className="space-y-4">
                          {/* 抽出された課題 */}
                          {company.challenges?.challenges && (
                            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                              <h4 className="font-bold text-lg text-yellow-800 mb-2">抽出された課題</h4>
                              <div className="space-y-2">
                                {company.challenges.challenges.map((challenge: any, idx: number) => (
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
                                      {challenge.keywords?.map((keyword: string, kidx: number) => (
                                        <span key={kidx} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                          {keyword}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* マッチング結果 */}
                          {company.matches && company.matches.length > 0 && (
                            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                              <h4 className="font-bold text-lg text-green-800 mb-3">
                                マッチング結果 ({company.totalMatches}件)
                              </h4>
                              <div className="space-y-3">
                                {company.matches.slice(0, 3).map((match: any, idx: number) => (
                                  <div key={idx} className="bg-white p-4 rounded border border-green-200">
                                    <div className="flex justify-between items-start mb-2">
                                      <h5 className="font-semibold text-green-800">{match.company_name}</h5>
                                      <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded">
                                        (match.total_score || 0)%
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-2">{match.industry} | {match.region}</p>
                                    <p className="text-sm text-gray-700 mb-2">{match.match_reason}</p>
                                    <p className="text-sm text-gray-600 mb-2">{match.solution_details}</p>
                                    
                                    {/* 解決できる課題の表示 */}
                                    {match.challenge && (
                                      <div className="mb-2">
                                        <p className="text-xs font-semibold text-gray-700 mb-1">解決できる課題:</p>
                                        <div className="text-xs text-gray-600">
                                          {(() => {
                                            // 課題のタイトル部分を抽出（**課題名**: の形式から）
                                            const challengeText = match.challenge;
                                            const titleMatch = challengeText.match(/\*\*(.*?)\*\*:/);
                                            if (titleMatch) {
                                              return <p>・{titleMatch[1]}</p>;
                                            }
                                            // マッチしない場合は最初の部分を表示
                                            return <p>・{challengeText.split(':')[0] || challengeText}</p>;
                                          })()}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {company.matches.length > 3 && (
                                  <p className="text-sm text-gray-600 text-center">
                                    他 {company.matches.length - 3} 件のマッチがあります
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ペルソナ抽出結果表示セクション */}
      {(personaResults || personaError) && (
        <section className="relative py-10">
          <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: 'url(/top1.png)' }}></div>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1020] via-[#0b1020]/80 to-[#0b1020]"></div>
          <div className="relative container mx-auto px-4">
            <div className="bg-white/95 text-slate-900 rounded-xl shadow-2xl p-6 md:p-8 backdrop-blur-sm">
              <h2 className="text-4xl font-bold [font-family:var(--font-serif-jp)] text-slate-900 tracking-wide mb-6">
                ペルソナ抽出結果
              </h2>
              
              {personaError && (
                <div className="bg-red-50 p-4 rounded border border-red-200 mb-6">
                  <p className="text-red-700">エラー: {personaError}</p>
                </div>
              )}

              {personaResults && (
                <div className="space-y-6">
                  {/* 処理ステップ */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold mb-3">処理ステップ</h3>
                    <div className="space-y-2">
                      {personaResults.results?.steps?.map((step: any, index: number) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-sm ${
                            step.status === 'success' ? 'bg-green-100 text-green-700' :
                            step.status === 'error' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : '○'}
                          </span>
                          <span className="text-sm">{step.step}: {step.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 抽出されたペルソナ */}
                  {personaResults.results?.personaResults?.extractedPersonas && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-3">抽出された{personaResults.results?.companyName || '企業'}のペルソナ</h3>
                      <div className="space-y-4">
                        {personaResults.results.personaResults.extractedPersonas.targets?.map((target: any, targetIndex: number) => (
                          <div key={targetIndex} className="bg-white p-4 rounded border">
                            <h4 className="font-semibold text-blue-800 mb-2">
                              業種: {target.industry_normalized} (信頼度: {target.confidence_industry})
                            </h4>
                            <div className="space-y-2">
                              {target.personas?.map((persona: any, personaIndex: number) => (
                                <div key={personaIndex} className="bg-gray-50 p-3 rounded">
                                  <p className="font-medium text-gray-800">{persona.persona_mapped || persona.persona_statement_raw}</p>
                                  <p className="text-sm text-gray-600">信頼度: {persona.confidence}</p>
                                  {persona.evidence_snippets && persona.evidence_snippets.length > 0 && (
                                    <div className="mt-2">
                                      <p className="text-xs font-semibold text-gray-700">根拠:</p>
                                      {persona.evidence_snippets.map((snippet: string, snippetIndex: number) => (
                                        <p key={snippetIndex} className="text-xs text-gray-600">・{snippet}</p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ターゲット検索結果 */}
                  {personaResults.results?.targetSearchResults?.results && (
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-3">
                        ターゲット検索結果 (総マッチ数: {personaResults.results.targetSearchResults.results.summary?.totalMatches || 0}件)
                      </h3>
                      <div className="space-y-4">
                        {personaResults.results.targetSearchResults.results.searchResults?.map((searchResult: any, searchIndex: number) => (
                          <div key={searchIndex} className="bg-white p-4 rounded border">
                            <h4 className="font-semibold text-green-800 mb-2">
                              業種: {searchResult.industry} (マッチ数: {searchResult.totalMatches}件)
                            </h4>
                            <div className="space-y-3">
                              {searchResult.personas?.map((persona: any, personaIndex: number) => (
                                <div key={personaIndex} className="bg-gray-50 p-3 rounded">
                                  <p className="font-medium text-gray-800">{persona.personaMapped || persona.personaStatement}</p>
                                  <p className="text-sm text-gray-600">マッチ数: {persona.matchCount}件</p>
                                  {persona.symptomKeywords && persona.symptomKeywords.length > 0 && (
                                    <div className="mt-2">
                                      <p className="text-xs font-semibold text-gray-700">検索キーワード:</p>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {persona.symptomKeywords.map((keyword: string, keywordIndex: number) => (
                                          <span key={keywordIndex} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                            {keyword}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {persona.matches && persona.matches.length > 0 && (
                                    <div className="mt-2">
                                      <p className="text-xs font-semibold text-gray-700 mb-2">マッチした企業例:</p>
                                      <div className="overflow-x-auto">
                                        <table className="min-w-full text-xs border-collapse border border-gray-300">
                                          <thead>
                                            <tr className="bg-gray-100">
                                              <th className="border border-gray-300 px-2 py-1 text-left">商材</th>
                                              <th className="border border-gray-300 px-2 py-1 text-left">部署</th>
                                              <th className="border border-gray-300 px-2 py-1 text-left">規模</th>
                                              <th className="border border-gray-300 px-2 py-1 text-left">課題</th>
                                              <th className="border border-gray-300 px-2 py-1 text-left">症状</th>
                                              <th className="border border-gray-300 px-2 py-1 text-left">提案施策</th>
                                              <th className="border border-gray-300 px-2 py-1 text-left">KPI</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {persona.matches.slice(0, 5).map((match: any, matchIndex: number) => (
                                              <tr key={matchIndex} className={matchIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                <td className="border border-gray-300 px-2 py-1">{match.BUSINESS_TAG || '-'}</td>
                                                <td className="border border-gray-300 px-2 py-1">{match.DEPARTMENT || '-'}</td>
                                                <td className="border border-gray-300 px-2 py-1">{match.SIZE_BAND || '-'}</td>
                                                <td className="border border-gray-300 px-2 py-1">{match.CHALLENGE_NAME || '-'}</td>
                                                <td className="border border-gray-300 px-2 py-1 max-w-xs truncate" title={match.SYMPTOM || ''}>
                                                  {match.SYMPTOM ? (match.SYMPTOM.length > 50 ? match.SYMPTOM.substring(0, 50) + '...' : match.SYMPTOM) : '-'}
                                                </td>
                                                <td className="border border-gray-300 px-2 py-1 max-w-xs truncate" title={match.RECOMMENDED_OUTBOUND_PLAY || ''}>
                                                  {match.RECOMMENDED_OUTBOUND_PLAY ? (match.RECOMMENDED_OUTBOUND_PLAY.length > 50 ? match.RECOMMENDED_OUTBOUND_PLAY.substring(0, 50) + '...' : match.RECOMMENDED_OUTBOUND_PLAY) : '-'}
                                                </td>
                                                <td className="border border-gray-300 px-2 py-1 max-w-xs truncate" title={match.PRIMARY_KPI || ''}>
                                                  {match.PRIMARY_KPI ? (match.PRIMARY_KPI.length > 30 ? match.PRIMARY_KPI.substring(0, 30) + '...' : match.PRIMARY_KPI) : '-'}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                      {persona.matches.length > 5 && (
                                        <p className="text-xs text-gray-500 mt-1">
                                          他 {persona.matches.length - 5} 件のマッチがあります
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI推論によるターゲット組織提案 */}
                  {personaResults.results?.targetSearchResults?.results?.searchResults?.some((result: any) => 
                    result.personas?.some((persona: any) => persona.targetOrganizations)
                  ) && (
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-3">AI推論によるターゲット組織提案</h3>
                      <div className="space-y-4">
                        {personaResults.results.targetSearchResults.results.searchResults?.map((searchResult: any, searchIndex: number) => (
                          searchResult.personas?.map((persona: any, personaIndex: number) => (
                            persona.targetOrganizations && persona.targetOrganizations.length > 0 && (
                              <div key={`${searchIndex}-${personaIndex}`} className="bg-white p-4 rounded border">
                                <h4 className="font-semibold text-yellow-800 mb-2">
                                  {persona.personaMapped || persona.personaStatement}
                                </h4>
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-xs border-collapse border border-gray-300">
                                    <thead>
                                      <tr className="bg-yellow-100">
                                        <th className="border border-gray-300 px-2 py-1 text-left">カテゴリ</th>
                                        <th className="border border-gray-300 px-2 py-1 text-left">組織名</th>
                                        <th className="border border-gray-300 px-2 py-1 text-left">理由</th>
                                        <th className="border border-gray-300 px-2 py-1 text-left">商材</th>
                                        <th className="border border-gray-300 px-2 py-1 text-left">部署</th>
                                        <th className="border border-gray-300 px-2 py-1 text-left">規模</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {persona.targetOrganizations.map((org: any, orgIndex: number) => (
                                        org.organizations?.map((organization: any, orgDetailIndex: number) => (
                                          <tr key={`${orgIndex}-${orgDetailIndex}`} className={orgDetailIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="border border-gray-300 px-2 py-1">{org.category || '-'}</td>
                                            <td className="border border-gray-300 px-2 py-1 font-medium">{organization.name || '-'}</td>
                                            <td className="border border-gray-300 px-2 py-1 max-w-xs truncate" title={organization.reason || ''}>
                                              {organization.reason ? (organization.reason.length > 50 ? organization.reason.substring(0, 50) + '...' : organization.reason) : '-'}
                                            </td>
                                            <td className="border border-gray-300 px-2 py-1">{org.businessTag || '-'}</td>
                                            <td className="border border-gray-300 px-2 py-1">{org.department || '-'}</td>
                                            <td className="border border-gray-300 px-2 py-1">{org.sizeBand || '-'}</td>
                                          </tr>
                                        ))
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )
                          ))
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ターゲット提案書 */}
                  {personaResults.results?.proposalResults?.proposal && (
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold mb-3">ターゲット提案書</h3>
                      <div className="bg-white p-4 rounded border">
                        <div className="prose max-w-none">
                          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                            {personaResults.results.proposalResults.proposal}
                          </pre>
                        </div>
                      </div>
                      
                      {/* マッチ統計情報 */}
                      {personaResults.results.proposalResults.matchStatistics && (
                        <div className="mt-4 bg-gray-50 p-3 rounded">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">分析統計</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="font-medium text-gray-600">総マッチ数: {personaResults.results.proposalResults.matchStatistics.totalMatches}件</p>
                              <p className="font-medium text-gray-600">トップ業種: {personaResults.results.proposalResults.matchStatistics.topIndustries?.join(', ') || 'なし'}</p>
                            </div>
                            <div>
                              <p className="font-medium text-gray-600">主要症状: {personaResults.results.proposalResults.matchStatistics.topSymptoms?.slice(0, 3).join(', ') || 'なし'}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 生データ（デバッグ用） */}
                  <details className="bg-gray-50 p-4 rounded-lg">
                    <summary className="cursor-pointer font-semibold">生データ（デバッグ用）</summary>
                    <pre className="mt-2 text-xs overflow-auto bg-white p-2 rounded border">
                      {JSON.stringify(personaResults, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
