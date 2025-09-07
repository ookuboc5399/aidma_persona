import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '../../../../lib/google';

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
    const { 
      url, 
      results 
    } = await req.json();
    
    if (!url || !results || !Array.isArray(results)) {
      return NextResponse.json({ 
        error: 'URL and results array are required' 
      }, { status: 400 });
    }

    const sheetId = getSheetIdFromUrl(url);
    if (!sheetId) {
      return NextResponse.json({ error: 'Invalid sheet URL' }, { status: 400 });
    }

    console.log('=== スプレッドシート結果書き込み開始 ===');
    console.log(`シートID: ${sheetId}`);
    console.log(`書き込む結果数: ${results.length}`);

    // 結果をスプレッドシートの形式に変換
    const rows = results.map((result: any) => [
      result.sheetName || '', // A列: シート名
      result.companyName || '', // B列: 企業名
      result.challenge || '', // C列: 抽出された課題
      result.excludedSpeakers || '', // D列: 除外された話者
      result.matchingCompany || '', // E列: マッチング企業
      '', // F列: 空欄
      result.solution || '' // G列: 解決できるソリューションの内容
    ]);

    // ヘッダー行を追加
    const headerRow = [
      'シート名', // A列
      '企業名', // B列
      '抽出された課題', // C列
      '除外された話者', // D列
      'マッチング企業', // E列
      '', // F列
      '解決できるソリューション' // G列
    ];

    // 既存のデータをクリアしてから新しいデータを書き込み
    const allRows = [headerRow, ...rows];
    
    const response = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'A:G',
        valueInputOption: 'RAW',
        requestBody: {
          values: allRows
        }
      });
    });

    console.log(`✅ スプレッドシート結果書き込み完了: ${rows.length}行を書き込み`);

    return NextResponse.json({
      success: true,
      message: `${rows.length}行の結果をスプレッドシートに書き込みました`,
      updatedRows: rows.length,
      sheetId
    });

  } catch (error: unknown) {
    console.error('スプレッドシート結果書き込みエラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ 
      error: `Failed to write results to spreadsheet: ${errorMessage}` 
    }, { status: 500 });
  }
}
