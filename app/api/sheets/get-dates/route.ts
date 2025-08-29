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
    const { url: masterSheetUrl } = await req.json();
    
    if (!masterSheetUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const masterSheetId = getSheetIdFromUrl(masterSheetUrl);
    if (!masterSheetId) {
      return NextResponse.json({ error: 'Invalid Master Sheet URL' }, { status: 400 });
    }

    console.log('=== 取材シート日付取得開始 ===');
    console.log(`マスターシートID: ${masterSheetId}`);

    // A列（日付）とB列（URL）を取得
    const listResponse = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: masterSheetId,
        range: '取材!A2:B',
      });
    });

    const allRows = listResponse.data.values;
    if (!allRows || allRows.length === 0) {
      return NextResponse.json({
        error: 'No data found in master sheet',
        dates: []
      }, { status: 404 });
    }

    // 有効な日付のみを抽出（ヘッダー行はrange指定で除外済み）
    const validDates = [];
    for (let index = 0; index < allRows.length; index++) { // インデックス0から開始
      const row = allRows[index];
      const date = row?.[0];
      const url = row?.[1];

      // 日付とURLの両方が存在する行のみを含める
      if (date && url) {
        validDates.push({
          rowIndex: index + 2, // 1ベースのインデックス（A2から始まるため+2）
          date,
          url,
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

    console.log(`✅ 日付取得完了: ${validDates.length}件の有効な日付を発見`);

    return NextResponse.json({
      success: true,
      dates: validDates,
      totalDates: validDates.length,
      message: `${validDates.length}件の有効な日付を取得しました`,
      debug_raw_google_response: allRows
    });

  } catch (error: unknown) {
    console.error('日付取得エラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
