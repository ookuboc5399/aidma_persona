import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '../../../../lib/google';
import { createClient } from '@supabase/supabase-js';

function getSheetIdFromUrl(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const sheets = getSheetsClient();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { url: masterSheetUrl } = await req.json();
    if (!masterSheetUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const masterSheetId = getSheetIdFromUrl(masterSheetUrl);
    if (!masterSheetId) {
      return NextResponse.json({ error: 'Invalid Master Sheet URL' }, { status: 400 });
    }

    // SSリスクのリストを取得
    const listRange = 'シート1!D2:H';
    const listResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSheetId,
      range: listRange,
    });

    const allRows = listResponse.data.values;
    if (!allRows || allRows.length === 0) return NextResponse.json({ inserted: 0 });

    const filteredRows = allRows.filter(row => row[4] === '未');
    if (filteredRows.length === 0) return NextResponse.json({ inserted: 0 });

    let inserted = 0;

    // 各子スプレッドシートから必要項目を取得してSupabaseへ保存
    for (const row of filteredRows) {
      const targetSheetName = row[0];
      const targetSheetUrl = row[1];
      if (!targetSheetName || !targetSheetUrl) continue;

      const targetSheetId = getSheetIdFromUrl(targetSheetUrl);
      if (!targetSheetId) continue;

      const ranges = [
        'C2', 'F2', 'C4', 'F3', 'C5', 'C6', 'F6',
        'C15', 'C16', 'C17', 'C18',
        'C20', 'C22', 'C24', 'C26',
        'C3'
      ].map(cell => `${targetSheetName}!${cell}`);

      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: targetSheetId,
        ranges,
      });

      const values = response.data.valueRanges?.map(range => range.values?.[0]?.[0] || '') || [];
      const receptionistTalk = [values[7], values[8], values[9], values[10]].filter(Boolean).join('\n');

      const record = {
        representative: values[0] || null,
        address: values[1] || null,
        employees: values[2] || null,
        website: values[3] || null,
        founded: values[4] || null,
        business_info: values[5] || null,
        marketing_purpose: values[6] || null,
        receptionist_talk: receptionistTalk || null,
        target_talk: values[11] || null,
        closing_talk: values[12] || null,
        appt_confirmation_talk: values[13] || null,
        hearing_talk: values[14] || null,
        industry: values[15] || null,
      };

      const { error } = await supabase.from('rag_talk_knowledge').insert(record);
      if (error) throw error;
      inserted += 1;
    }

    return NextResponse.json({ inserted });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
} 