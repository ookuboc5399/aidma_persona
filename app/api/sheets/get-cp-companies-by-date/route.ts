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
    const { date, url } = await req.json();
    
    if (!date || !url) {
      return NextResponse.json({ error: 'Date and URL are required' }, { status: 400 });
    }

    const targetSheetId = getSheetIdFromUrl(url);
    if (!targetSheetId) {
      return NextResponse.json({ error: 'Invalid target sheet URL' }, { status: 400 });
    }

    const targetSheetName = 'シート1';

    logCompanyData('CP', '企業データ取得開始', {
      date,
      sheetId: targetSheetId,
      url,
      targetSheet: targetSheetName
    });

    // 対象スプレッドシートから企業データを取得（A〜D列まで取得）
    const targetResponse = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: targetSheetId,
        range: `'${targetSheetName}'!A:D`,
      });
    });

    const targetRows = targetResponse.data.values;
    if (!targetRows || targetRows.length === 0) {
      return NextResponse.json({ 
        error: 'No data found in target sheet',
        companies: [],
        totalCompanies: 0
      });
    }

    logCompanyData('CP', '対象スプレッドシートのデータ取得', {
      totalRows: targetRows.length,
      maxColumns: Math.max(...targetRows.map(row => row?.length || 0))
    });

    // 各列から企業データを抽出（get-companies-by-dateと同じ方式）
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

    // 各列を処理（get-companies-by-dateと同じ方式）
    const maxColumns = Math.max(...targetRows.map(row => row?.length || 0));
    
    for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
      // 各列の1行目を列名として取得
      const columnHeader = targetRows[0]?.[colIndex];
      
      if (!columnHeader || columnHeader.trim() === '') {
        continue; // 空の列はスキップ
      }

      // その列のデータを取得（2行目以降）
      const dataRows = [];
      for (let rowIndex = 1; rowIndex < targetRows.length; rowIndex++) {
        const cellData = targetRows[rowIndex]?.[colIndex];
        if (cellData && cellData.trim() !== '') {
          dataRows.push(cellData);
        }
      }

      if (dataRows.length === 0) {
        continue; // データがない列はスキップ
      }

      const conversationData = dataRows.join('\n');
      const columnLetter = String.fromCharCode(65 + colIndex); // A, B, C, D...

      logCompanyData('CP', `列${columnLetter}のデータ処理`, {
        columnHeader,
        dataLength: conversationData.length,
        first100Chars: conversationData.substring(0, 100),
        hasValidData: !(!conversationData || conversationData.trim() === '会話データ')
      });

      if (!conversationData || conversationData.trim() === '会話データ') {
        logCompanyData('CP', `列${columnLetter}に有効な会話データが見つかりません`);
        continue;
      }

      // 会話データから複数企業を抽出
      try {
        const extractedCompanies = extractMultipleCompaniesFromConversation(conversationData);
        logCompanyData('CP', `列${columnLetter}の企業抽出結果`, {
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

          allCompanies.push({
            companyName: extracted.companyName,
            columnIndex: colIndex,
            columnLetter,
            conversationData: companySpecificData,
            extractionMethod: 'conversation_analysis',
            originalTitle: extracted.rawTitle,
            meetingType: extracted.meetingType,
            confidence: extracted.confidence,
            isExtractedFromConversation: true
          });
        }
      } catch (extractError) {
        logCompanyData('CP', `列${columnLetter}の企業抽出エラー`, { error: extractError });
        // エラーが発生した場合は、会話データ全体を1つの企業として扱う
        allCompanies.push({
          companyName: '抽出エラー',
          columnIndex: colIndex,
          columnLetter,
          conversationData,
          extractionMethod: 'conversation_analysis_error',
          isExtractedFromConversation: true
        });
      }
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

    logCompanyData('CP', '企業データ取得完了', {
      totalCompanies: uniqueCompanies.length,
      targetSheetName
    });

    return NextResponse.json({
      success: true,
      companies: uniqueCompanies,
      totalCompanies: uniqueCompanies.length,
      date,
      sheetId: targetSheetId,
      sheetName: targetSheetName, // 対象スプレッドシートの名前を使用
      sheetType: 'CP',
      message: `${uniqueCompanies.length}社の課題抽出対象企業を取得しました（対象: ${targetSheetName}）`
    });

  } catch (error: unknown) {
    logError('CPシート企業データ取得', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}