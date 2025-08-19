
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

    // B列のスプレッドシートURLを取得
    const listResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: 'B:B',
    });

    const allRows = listResponse.data.values;
    if (!allRows || allRows.length === 0) return NextResponse.json({ data: [] });

    const promises = allRows.map(async (row, index) => {
      if (!row || !row[0]) {
        return { 
          rowIndex: index + 1, 
          error: 'No URL found in this row'
        };
      }

      const targetSheetUrl = row[0];
      const targetSheetId = getSheetIdFromUrl(targetSheetUrl);
      
      if (!targetSheetId) {
        return { 
          rowIndex: index + 1, 
          error: 'Invalid sheet URL' 
        };
      }

      try {
        // 対象シートからA列（企業名）とD列（会話データ）を取得
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: targetSheetId,
          range: 'A:D',
        });

        const targetRows = response.data.values;
        if (!targetRows || targetRows.length === 0) {
          return {
            rowIndex: index + 1,
            error: 'No data found in target sheet'
          };
        }

        // A列から企業名を取得（最初の行）
        const companyName = targetRows[0]?.[0] || '不明な企業';
        
        // D列から会話データを取得（すべての行）
        const conversationData = targetRows
          .map(row => row[3])
          .filter(Boolean)
          .join('\n');

        if (!conversationData) {
          return {
            rowIndex: index + 1,
            error: 'No conversation data found in column D'
          };
        }

        return {
          rowIndex: index + 1,
          targetSheetId,
          sheetUrl: targetSheetUrl,
          companyName,
          conversationData,
        };

      } catch (e: unknown) {
        const errorMessage = getErrorMessage(e);
        return { 
          rowIndex: index + 1, 
          error: errorMessage 
        };
      }
    });

    const results = await Promise.all(promises);
    return NextResponse.json({ data: results });

  } catch (error: unknown) {
    console.error('Sheets Read API error:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
