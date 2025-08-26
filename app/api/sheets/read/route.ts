
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
    const { url: masterSheetUrl } = await req.json();
    if (!masterSheetUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const masterSheetId = getSheetIdFromUrl(masterSheetUrl);
    if (!masterSheetId) {
      return NextResponse.json({ error: 'Invalid Master Sheet URL' }, { status: 400 });
    }

    // B列のスプレッドシートURLを取得（リトライ機能付き）
    const listResponse = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: masterSheetId,
        range: 'B:B',
      });
    });

    const allRows = listResponse.data.values;
    if (!allRows || allRows.length === 0) return NextResponse.json({ data: [] });

    // 並列処理ではなく、順次処理でAPI制限を回避
    const results = [];
    for (let index = 0; index < allRows.length; index++) {
      const row = allRows[index];
      let statusToUpdate: string | null = null;

      try {
        if (!row || !row[0]) {
          results.push({ 
            rowIndex: index + 1, 
            error: 'No URL found in this row'
          });
          statusToUpdate = 'URLなし';
          continue;
        }

        const targetSheetUrl = row[0];
        const targetSheetId = getSheetIdFromUrl(targetSheetUrl);
        
        if (!targetSheetId) {
          results.push({ 
            rowIndex: index + 1, 
            error: 'Invalid sheet URL' 
          });
          statusToUpdate = 'URL不正';
          continue;
        }

        // 対象シートからA列（企業名）とD列（会話データ）を取得（リトライ機能付き）
        const response = await retryWithBackoff(async () => {
          return await sheets.spreadsheets.values.get({
            spreadsheetId: targetSheetId,
            range: 'A:D',
          });
        });

        const targetRows = response.data.values;
        if (!targetRows || targetRows.length === 0) {
          results.push({
            rowIndex: index + 1,
            error: 'No data found in target sheet'
          });
          statusToUpdate = 'データなし';
          continue;
        }

        // A列から企業名を取得（最初の行）
        const companyName = targetRows[0]?.[0] || '不明な企業';
        
        // D列から会話データを取得（すべての行）
        const conversationData = targetRows
          .map(row => row[3])
          .filter(Boolean)
          .join('\n');

        if (!conversationData || conversationData.trim() === '会話データ') {
          statusToUpdate = '会話データなし';
        } else {
          results.push({
            rowIndex: index + 1,
            targetSheetId,
            sheetUrl: targetSheetUrl,
            companyName,
            conversationData,
          });
          statusToUpdate = '✔';
        }
      } catch (e: unknown) {
        const errorMessage = getErrorMessage(e);
        results.push({ 
          rowIndex: index + 1, 
          error: errorMessage 
        });
        statusToUpdate = 'エラー';
      } finally {
        // マスターシートのC列を更新
        if (statusToUpdate) {
          try {
            await retryWithBackoff(async () => {
              await sheets.spreadsheets.values.update({
                spreadsheetId: masterSheetId,
                range: `C${index + 1}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                  values: [[statusToUpdate]],
                },
              });
            });
          } catch (updateError) {
            console.error(`Failed to update status for row ${index + 1}:`, updateError);
            // ここでのエラーは全体の処理を止めないように握りつぶす
          }
        }
        
        // API制限回避のため、リクエスト間に短い間隔を設ける
        if (index < allRows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms待機
        }
      }
    }
    return NextResponse.json({ data: results });

  } catch (error: unknown) {
    console.error('Sheets Read API error:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
