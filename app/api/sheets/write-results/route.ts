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
    const { 
      url, 
      results 
    } = await req.json();
    
    if (!url || !results || !Array.isArray(results)) {
      return NextResponse.json({ 
        error: 'URL and results array are required' 
      }, { status: 400 });
    }

    const sheetId = getSheetIdFromUrl(url);
    if (!sheetId) {
      return NextResponse.json({ error: 'Invalid sheet URL' }, { status: 400 });
    }

    console.log('=== スプレッドシート結果書き込み開始 ===');
    console.log(`シートID: ${sheetId}`);
    console.log(`書き込む結果数: ${results.length}`);
    
    // デバッグ: 各結果のマッチングデータを確認
    results.forEach((result: any, index: number) => {
      console.log(`\n--- 結果 ${index + 1} ---`);
      console.log(`企業名: ${result.companyName}`);
      console.log(`result全体のキー:`, Object.keys(result));
      console.log(`comprehensiveMatches:`, result.comprehensiveMatches);
      console.log(`matches:`, result.matches);
      console.log(`comprehensiveMatches長さ: ${result.comprehensiveMatches?.length || 0}`);
      console.log(`matches長さ: ${result.matches?.length || 0}`);
      
      // マッチング結果の詳細確認
      if (result.comprehensiveMatches && result.comprehensiveMatches.length > 0) {
        console.log(`comprehensiveMatches[0]:`, result.comprehensiveMatches[0]);
      }
      if (result.matches && result.matches.length > 0) {
        console.log(`matches[0]:`, result.matches[0]);
      }
    });

    // 結果をスプレッドシートの形式に変換（3位まで表示）
    const rows = results.flatMap((result: any) => {
      const baseRow = [
        result.sheetName || '', // A列: シート名
        result.companyName || '', // B列: 企業名
        result.challenge || '', // C列: 抽出された課題
        result.excludedSpeakers || '' // D列: 除外された話者
      ];

      // マッチング結果を3位まで取得（古い形式と新しい形式の両方に対応）
      let matches = result.comprehensiveMatches || result.matches || [];
      
      // 古い形式のデータの場合（matchingCompany, solutionが直接設定されている場合）
      if (matches.length === 0 && result.matchingCompany) {
        console.log(`古い形式のデータを検出: matchingCompany="${result.matchingCompany}", solution="${result.solution}"`);
        matches = [{
          company_name: result.matchingCompany,
          consultant_name: result.excludedSpeakers || '',
          business_description: result.solution || '',
          solution_details: result.solution || '',
          match_reason: result.solution || ''
        }];
        console.log(`古い形式のデータを新しい形式に変換:`, matches);
      }
      
      const top3Matches = matches.slice(0, 3);
      
      console.log(`企業: ${result.companyName}`);
      console.log(`取得したマッチング結果数: ${matches.length}`);
      console.log(`上位3位:`, top3Matches.map((m: any) => ({ 
        name: m.company_name, 
        consultant: m.consultant_name,
        business_description: m.business_description?.substring(0, 50) + '...' || 'なし'
      })));
      
      // 古い形式のデータの場合の説明
      if (matches.length === 1 && result.matchingCompany) {
        console.log(`ℹ️ 古い形式のデータ: 1位のみ表示、2位・3位は空行`);
      }

      // 3位まで表示する行を作成
      const matchRows = [];
      for (let i = 0; i < 3; i++) {
        const match = top3Matches[i];
        if (match) {
          matchRows.push([
            ...baseRow,
            match.company_name || '', // E列: マッチング企業名
            match.consultant_name || '', // F列: CONSULTANT_NAME
            match.business_description || match.solution_details || match.match_reason || '' // G列: 解決できるソリューションの内容
          ]);
        } else {
          // マッチング結果がない場合は空行
          matchRows.push([
            ...baseRow,
            '', // E列: 空欄
            '', // F列: 空欄
            '' // G列: 空欄
          ]);
        }
      }

      return matchRows;
    });

    // ヘッダー行は別途手動で用意されていることを前提とし、データ行のみを追記する
    const response = await retryWithBackoff(async () => {
      // シート名を取得するためにスプレッドシートのメタデータを取得
      const sheetInfo = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
      });
      const firstSheetName = sheetInfo.data.sheets?.[0]?.properties?.title;

      if (!firstSheetName) {
        throw new Error('No sheet found in the spreadsheet.');
      }

      return await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: firstSheetName, // 最初のシートに追記
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rows
        }
      });
    });

    console.log(`✅ スプレッドシート結果書き込み完了: ${rows.length}行を書き込み（各企業3行ずつ）`);

    return NextResponse.json({
      success: true,
      message: `${rows.length}行の結果をスプレッドシートに書き込みました（各企業3位まで表示）`,
      updatedRows: rows.length,
      originalResults: results.length,
      sheetId
    });

  } catch (error: unknown) {
    console.error('スプレッドシート結果書き込みエラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ 
      error: `Failed to write results to spreadsheet: ${errorMessage}` 
    }, { status: 500 });
  }
}
