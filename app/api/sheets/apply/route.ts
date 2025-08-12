
import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient, getDriveClient } from '../../../../lib/google';

export async function POST(req: NextRequest) {
  try {
    const { spreadsheetId, improvedTalk } = await req.json();

    if (!spreadsheetId || !improvedTalk) {
      return NextResponse.json({ error: 'spreadsheetId and improvedTalk are required' }, { status: 400 });
    }

    const sheets = getSheetsClient();
    const drive = getDriveClient();

    // 1. 元のシート名を取得
    const sheetMetadata = await sheets.spreadsheets.get({ spreadsheetId });
    const originalTitle = sheetMetadata.data.properties?.title;

    // 2. シートを複製
    const newTitle = `PMO改善_${originalTitle}`;
    const driveResponse = await drive.files.copy({
      fileId: spreadsheetId,
      requestBody: {
        name: newTitle,
      },
    });

    const newSheetId = driveResponse.data.id;
    if (!newSheetId) {
      throw new Error('Failed to copy sheet.');
    }

    // 3. B36セルを改善トークで更新
    await sheets.spreadsheets.values.update({
      spreadsheetId: newSheetId,
      range: 'Sheet1!B36', // ここも実際のシート名に合わせてください
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[improvedTalk]],
      },
    });

    // 4. 新しいシートのURLを生成して返す
    const newSheetUrl = `https://docs.google.com/spreadsheets/d/${newSheetId}/edit`;

    return NextResponse.json({ newSheetUrl });

  } catch (error) {
    console.error('Sheets Apply API error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
