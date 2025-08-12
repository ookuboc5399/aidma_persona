
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

    const listRange = 'シート1!D2:H';
    const listResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: listRange,
    });

    const allRows = listResponse.data.values;
    if (!allRows || allRows.length === 0) return NextResponse.json({ data: [] });

    const filteredRows = allRows.filter(row => row[4] === '未');
    if (filteredRows.length === 0) return NextResponse.json({ data: [] });

    const promises = filteredRows.map(async (row) => {
      const targetSheetName = row[0];
      const targetSheetUrl = row[1];
      const originalIndex = allRows.findIndex(r => r === row);

      if (!targetSheetName || !targetSheetUrl) {
        return { rowIndex: originalIndex + 2, error: 'Incomplete row data' };
      }

      const targetSheetId = getSheetIdFromUrl(targetSheetUrl);
      if (!targetSheetId) {
        return { rowIndex: originalIndex + 2, error: 'Invalid target URL' };
      }

      try {
        const ranges = [
          'C2', 'F2', 'C4', 'F3', 'C5', 'C6', 'F6',
          'C15', 'C16', 'C17', 'C18',
          'C20', 'C22', 'C24', 'C26',
          'C3' // 業界情報を追加
        ].map(cell => `${targetSheetName}!${cell}`);
        
        const response = await sheets.spreadsheets.values.batchGet({
          spreadsheetId: targetSheetId,
          ranges,
        });

        const values = response.data.valueRanges?.map(range => range.values?.[0]?.[0] || '') || [];

        const receptionistTalk = [values[7], values[8], values[9], values[10]].filter(Boolean).join('\n');

        const extractedData = {
          representative: values[0],
          address: values[1],
          employees: values[2],
          website: values[3],
          founded: values[4],
          businessInfo: values[5],
          marketingPurpose: values[6],
          receptionistTalk: receptionistTalk,
          targetTalk: values[11],
          closingTalk: values[12],
          apptConfirmationTalk: values[13],
          hearingTalk: values[14],
          industry: values[15], // 業界情報を追加
        };

        return {
          rowIndex: originalIndex + 2,
          targetSheetId,
          data: extractedData,
        };
      } catch (e: unknown) {
        const errorMessage = getErrorMessage(e);
        return { rowIndex: originalIndex + 2, error: errorMessage };
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
