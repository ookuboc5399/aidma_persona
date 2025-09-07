import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '../../../../lib/google';
import { logDateData, logError } from '../../../../lib/logger';

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
  let sheetType: 'CL' | 'CU' | 'CP';
  try {
    const sheets = getSheetsClient();
    const { url: sheetUrl, sheetType: st = 'CP' } = await req.json();
    sheetType = st as 'CL' | 'CU' | 'CP';
    
    if (!sheetUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!['CL', 'CU', 'CP'].includes(sheetType)) {
      return NextResponse.json({ error: 'Invalid sheet type. Must be CL, CU, or CP' }, { status: 400 });
    }

    const sheetId = getSheetIdFromUrl(sheetUrl);
    if (!sheetId) {
      return NextResponse.json({ error: `Invalid ${sheetType} Sheet URL` }, { status: 400 });
    }

    try {
      const spreadsheetMetadata = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        fields: 'sheets.properties.title',
      });

      const sheetTitles = spreadsheetMetadata.data.sheets?.map(s => s.properties?.title);
      logDateData(sheetType, 'スプレッドシート内のシート一覧', { sheets: sheetTitles });

      if (!sheetTitles?.includes(sheetType)) {
        logError(sheetType, `指定されたシート(${sheetType})がスプレッドシート内に見つかりません。`);
        return NextResponse.json({ error: `Sheet '${sheetType}' not found in spreadsheet.` }, { status: 404 });
      }

    } catch (metaError) {
      logError(sheetType, 'スプレッドシートメタデータの取得に失敗しました', metaError);
      return NextResponse.json({ error: 'Failed to retrieve spreadsheet metadata.' }, { status: 500 });
    }

    logDateData(sheetType, '日付取得開始', {
      sheetId: sheetId,
      url: sheetUrl,
    });

    const listResponse = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${sheetType}!A:C`,
      });
    });

    const allRows = listResponse.data.values;
    if (!allRows || allRows.length === 0) {
      return NextResponse.json({
        error: `No data found in ${sheetType} sheet`,
        dates: []
      }, { status: 404 });
    }

    const validDates = [];
    for (let index = 1; index < allRows.length; index++) {
      const row = allRows[index];
      const date = row?.[0];
      const url = row?.[1];
      const status = row?.[2];

      if (date && url && status !== '会話データなし' && status !== 'URL不正') {
        logDateData(sheetType, `日付データ: ${date}`, { url });
        validDates.push({
          rowIndex: index + 1,
          date,
          url,
          status: status || '', // 空欄の場合も考慮
          displayDate: date
        });
      }
    }

    validDates.sort((a, b) => {
      const dateA = new Date(a.date.replace(/\//g, '-'));
      const dateB = new Date(b.date.replace(/\//g, '-'));
      return dateB.getTime() - dateA.getTime();
    });

    logDateData(sheetType, '日付取得完了', {
      validDatesCount: validDates.length,
      validDates: validDates.map(vd => ({ date: vd.date, url: vd.url }))
    });

    return NextResponse.json({
      success: true,
      dates: validDates,
      totalDates: validDates.length,
      sheetType,
      message: `${validDates.length}件の有効な日付を取得しました（課題抽出対象）`
    });

  } catch (error: unknown) {
    logError('CPシート日付取得', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}