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

    console.log('=== 課題抽出用データ読み取り開始 ===');
    console.log(`マスターシートID: ${masterSheetId}`);

    // A列（日付）、B列（URL）、C列（ステータス）を取得
    const listResponse = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: masterSheetId,
        range: 'A:C',
      });
    });

    const allRows = listResponse.data.values;
    if (!allRows || allRows.length === 0) {
      return NextResponse.json({
        error: 'No data found in master sheet',
        validRows: []
      }, { status: 404 });
    }

    // ヘッダー行をスキップして、C列が「会話データなし」以外のものをフィルタリング
    const validRows = [];
    for (let index = 1; index < allRows.length; index++) { // インデックス1から開始（ヘッダーをスキップ）
      const row = allRows[index];
      const date = row?.[0];
      const url = row?.[1];
      const status = row?.[2];

      // URLが存在し、ステータスが「会話データなし」でない行のみを含める
      if (url && status !== '会話データなし' && status !== 'URL不正') {
        validRows.push({
          rowIndex: index + 1, // 1ベースのインデックス
          date,
          url,
          status: status || '未処理'
        });
      }
    }

    console.log(`✅ フィルタリング完了: ${validRows.length}件の有効な行を発見`);

    return NextResponse.json({
      success: true,
      totalRows: allRows.length - 1, // ヘッダーを除く
      validRows,
      validRowsCount: validRows.length,
      message: `課題抽出対象として${validRows.length}件の有効な行を取得しました`
    });

  } catch (error: unknown) {
    console.error('課題抽出用データ読み取りエラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
