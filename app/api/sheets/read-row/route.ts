import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '../../../../lib/google';

function getErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    if ('response' in err) {
      const resp = (err as { response?: { data?: { error?: { message?: unknown } } } }).response;
      const msg = resp?.data?.error?.message;
      if (typeof msg === 'string') return msg;
    }
    if ('message' in err && typeof (err as { message?: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
  }
  return String(err);
}

function getSheetIdFromUrl(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// リトライ機能付きの実行関数
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error?.message?.includes('Quota exceeded') && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt); // 指数バックオフ
        console.log(`Quota exceeded, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

export async function POST(req: NextRequest) {
  try {
    const sheets = getSheetsClient();
    const { url: masterSheetUrl, rowIndex } = await req.json();
    
    if (!masterSheetUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    
    if (!rowIndex || typeof rowIndex !== 'number' || rowIndex < 1) {
      return NextResponse.json({ error: 'Valid rowIndex is required (must be >= 1)' }, { status: 400 });
    }

    const masterSheetId = getSheetIdFromUrl(masterSheetUrl);
    if (!masterSheetId) {
      return NextResponse.json({ error: 'Invalid Master Sheet URL' }, { status: 400 });
    }

    console.log(`=== Reading specific row ${rowIndex} from master sheet ===`);

    // 指定された行のB列のスプレッドシートURLを取得
    const listResponse = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: masterSheetId,
        range: `B${rowIndex}:B${rowIndex}`,
      });
    });

    const rows = listResponse.data.values;
    if (!rows || rows.length === 0 || !rows[0] || !rows[0][0]) {
      return NextResponse.json({ 
        error: `No URL found in row ${rowIndex}`,
        rowIndex 
      }, { status: 404 });
    }

    const targetSheetUrl = rows[0][0];
    const targetSheetId = getSheetIdFromUrl(targetSheetUrl);
    
    if (!targetSheetId) {
      return NextResponse.json({ 
        error: `Invalid sheet URL in row ${rowIndex}`,
        rowIndex,
        targetSheetUrl 
      }, { status: 400 });
    }

    console.log(`Reading data from target sheet: ${targetSheetId}`);

    // 対象シートからA列（企業名）とD列（会話データ）を取得
    const response = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: targetSheetId,
        range: 'A:D',
      });
    });

    const targetRows = response.data.values;
    if (!targetRows || targetRows.length === 0) {
      return NextResponse.json({
        error: `No data found in target sheet for row ${rowIndex}`,
        rowIndex,
        targetSheetId
      }, { status: 404 });
    }

    // A列から企業名を取得（最初の行）
    const companyName = targetRows[0]?.[0] || '不明な企業';
    
    // D列から会話データを取得（すべての行）
    const conversationData = targetRows
      .map(row => row[3])
      .filter(Boolean)
      .join('\n');

    if (!conversationData || conversationData.trim() === '会話データ') {
      return NextResponse.json({
        error: `No conversation data found in target sheet for row ${rowIndex}`,
        rowIndex,
        targetSheetId,
        companyName
      }, { status: 404 });
    }

    const result = {
      rowIndex,
      targetSheetId,
      sheetUrl: targetSheetUrl,
      companyName,
      conversationData,
    };

    console.log(`✅ Successfully read row ${rowIndex}: ${companyName}`);

    return NextResponse.json({ 
      data: [result],
      message: `Successfully read row ${rowIndex}`
    });

  } catch (error: unknown) {
    console.error('Sheets Read Row API error:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
