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
    const { url: clSheetUrl } = await req.json();
    
    if (!clSheetUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const clSheetId = getSheetIdFromUrl(clSheetUrl);
    if (!clSheetId) {
      return NextResponse.json({ error: 'Invalid CL Sheet URL' }, { status: 400 });
    }

    console.log('=== CLシート日付取得開始 ===');
    console.log(`CLシートID: ${clSheetId}`);

    // A列（日付）、B列（URL）、C列（ステータス）を取得
    const listResponse = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: clSheetId,
        range: 'A:C',
      });
    });

    const allRows = listResponse.data.values;
    if (!allRows || allRows.length === 0) {
      return NextResponse.json({
        error: 'No data found in CL sheet',
        dates: []
      }, { status: 404 });
    }

    // ヘッダー行をスキップして、有効な日付のみを抽出
    // C列が「会話データなし」や「URL不正」でない行のみを対象とする
    const validDates = [];
    for (let index = 1; index < allRows.length; index++) { // インデックス1から開始（ヘッダーをスキップ）
      const row = allRows[index];
      const date = row?.[0];
      const url = row?.[1];
      const status = row?.[2];

      // 日付とURLが存在し、ステータスが有効な行のみを含める
      if (date && url && status && 
          status !== '会話データなし' && 
          status !== 'URL不正' && 
          status.trim() !== '') {
        validDates.push({
          rowIndex: index + 1, // 1ベースのインデックス
          date,
          url,
          status,
          displayDate: date // 表示用の日付
        });
      }
    }

    // 日付でソート（新しい順）
    validDates.sort((a, b) => {
      const dateA = new Date(a.date.replace(/\//g, '-'));
      const dateB = new Date(b.date.replace(/\//g, '-'));
      return dateB.getTime() - dateA.getTime();
    });

    console.log(`✅ CLシート日付取得完了: ${validDates.length}件の有効な日付を発見`);

    return NextResponse.json({
      success: true,
      dates: validDates,
      totalDates: validDates.length,
      message: `${validDates.length}件の有効な日付を取得しました（課題抽出対象）`
    });

  } catch (error: unknown) {
    console.error('CLシート日付取得エラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
