import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '../../../../lib/google';
import { logCompanyData, logError } from '../../../../lib/logger';
import { extractMultipleCompaniesFromConversation, extractCompanySpecificConversation } from '../../../../lib/company-extractor';

function getSheetIdFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

export async function POST(req: NextRequest) {
  try {
    const sheets = getSheetsClient();
    const { date, url, sheetType = 'CL' } = await req.json();
    
    if (!date || !url) {
      return NextResponse.json({ error: 'Date and URL are required' }, { status: 400 });
    }

    // シートタイプの検証
    if (!['CL', 'CU', 'CP'].includes(sheetType)) {
      return NextResponse.json({ error: 'Invalid sheet type. Must be CL, CU, or CP' }, { status: 400 });
    }

    const sheetId = getSheetIdFromUrl(url);
    if (!sheetId) {
      return NextResponse.json({ error: 'Invalid sheet URL' }, { status: 400 });
    }

    logCompanyData(sheetType as 'CL' | 'CU' | 'CP', '企業データ取得開始', {
      date,
      sheetId,
      sheetType,
      url
    });

    // スプレッドシートのメタデータを取得してシート名を取得
    const spreadsheetMetadata = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
      });
    });

    const sheetName = spreadsheetMetadata.data.properties?.title || 'Unknown Sheet';
    const sheetsList = spreadsheetMetadata.data.sheets || [];
    
    logCompanyData(sheetType as 'CL' | 'CU' | 'CP', 'スプレッドシート情報', {
      sheetName,
      sheetId,
      sheetsList: sheetsList.map((sheet: any, index: number) => ({
        index,
        title: sheet.properties?.title,
        gid: sheet.properties?.sheetId
      }))
    });

    // CLシート（GID: 0）のA列からD列のデータを取得
    const response = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'A:D', // GIDで指定されているので、シート名指定は不要
      });
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ 
        error: 'No data found in sheet',
        companies: [],
        totalCompanies: 0
      });
    }

    // 各列から企業データを抽出
    const allCompanies: Array<{
      companyName: string;
      columnIndex: number;
      columnLetter: string;
      conversationData: string;
      extractionMethod: string;
      originalTitle?: string;
      meetingType?: string;
      confidence?: number;
      isExtractedFromConversation: boolean;
    }> = [];

    // D列のみを処理（処理1と同じ方式）
    const colIndex = 3; // D列
    const columnLetter = 'D';
    
    // D列のデータを収集
    const conversationData = rows
      .map(row => row[colIndex])
      .filter(Boolean)
      .join('\n');

    logCompanyData(sheetType as 'CL' | 'CU' | 'CP', 'D列会話データ取得', {
      dataLength: conversationData.length,
      first100Chars: conversationData.substring(0, 100),
      hasValidData: !(!conversationData || conversationData.trim() === '会話データ')
    });

    if (!conversationData || conversationData.trim() === '会話データ') {
      logCompanyData(sheetType as 'CL' | 'CU' | 'CP', 'D列に有効な会話データが見つかりません');
      return NextResponse.json({
        success: true,
        companies: [],
        totalCompanies: 0,
        message: `${sheetType}シートのD列に有効な会話データが見つかりませんでした`
      });
    }

    // D列の会話データから複数企業を抽出
    try {
      const extractedCompanies = extractMultipleCompaniesFromConversation(conversationData);
      logCompanyData(sheetType as 'CL' | 'CU' | 'CP', '企業抽出結果', {
        extractedCount: extractedCompanies.length,
        companies: extractedCompanies.map(company => ({
          name: company.companyName,
          confidence: company.confidence
        }))
      });
      
      for (const extracted of extractedCompanies) {
        // 企業固有の会話データを抽出
        const companySpecificData = extractCompanySpecificConversation(
          conversationData, 
          extracted.companyName
        );
        
        console.log(`${extracted.companyName}: ${conversationData.length}文字 → ${companySpecificData.length}文字`);
        
        allCompanies.push({
          companyName: extracted.companyName,
          columnIndex: colIndex,
          columnLetter,
          conversationData: companySpecificData, // 企業固有のデータのみ
          extractionMethod: 'ai_extraction',
          originalTitle: extracted.rawTitle,
          meetingType: extracted.meetingType,
          confidence: extracted.confidence,
          isExtractedFromConversation: true
        });
      }
    } catch (error) {
      console.error(`Error extracting companies from D column:`, error);
      return NextResponse.json({
        error: `D列からの企業抽出エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false
      }, { status: 500 });
    }

    // 重複を除去（同じ企業名の場合、信頼度の高いものを優先）
    const uniqueCompanies = allCompanies.reduce((acc, company) => {
      const existing = acc.find(c => c.companyName === company.companyName);
      if (!existing) {
        acc.push(company);
      } else if (company.confidence && (!existing.confidence || company.confidence > existing.confidence)) {
        // より信頼度の高いものに置き換え
        const index = acc.indexOf(existing);
        acc[index] = company;
      }
      return acc;
    }, [] as typeof allCompanies);

    console.log(`✅ ${sheetType}シート企業データ取得完了: ${uniqueCompanies.length}社を発見`);

    return NextResponse.json({
      success: true,
      companies: uniqueCompanies,
      totalCompanies: uniqueCompanies.length,
      date,
      sheetId,
      sheetName,
      sheetType,
      message: `${uniqueCompanies.length}社の課題抽出対象企業を取得しました`
    });

  } catch (error: unknown) {
    logError('シート企業データ取得', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
