import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '../../../../lib/google';
import { extractCompanyNameDetailed } from '../../../../lib/utils';

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
    const { masterSheetUrl, selectedRows } = await req.json();

    if (!masterSheetUrl) {
      return NextResponse.json({ error: 'Master sheet URL is required' }, { status: 400 });
    }

    console.log('=== 課題抽出とマッチング処理開始 ===');
    console.log(`マスターシートURL: ${masterSheetUrl}`);
    console.log(`処理対象行数: ${selectedRows?.length || '全行'}`);

    // Step 1: 課題抽出対象データを取得
    const readResponse = await fetch(`${req.nextUrl.origin}/api/sheets/read-for-challenges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: masterSheetUrl }),
      signal: AbortSignal.timeout(2 * 60 * 1000), // 2分
    });

    if (!readResponse.ok) {
      const error = await readResponse.json();
      throw new Error(`課題抽出対象データ取得失敗: ${error.error}`);
    }

    const readResult = await readResponse.json();
    let targetRows = readResult.validRows;

    // 特定の行が指定されている場合はフィルタリング
    if (selectedRows && selectedRows.length > 0) {
      targetRows = targetRows.filter((row: any) => selectedRows.includes(row.rowIndex));
    }

    if (targetRows.length === 0) {
      return NextResponse.json({
        success: true,
        processedCompanies: [],
        totalProcessed: 0,
        message: '処理対象の有効な行が見つかりませんでした'
      });
    }

    console.log(`✅ 課題抽出対象: ${targetRows.length}件の行を処理開始`);

    const sheets = getSheetsClient();
    const results = [];

    // Step 2: 各行を順次処理
    for (const targetRow of targetRows) {
      try {
        console.log(`\n=== 行${targetRow.rowIndex}を処理中 ===`);
        console.log(`日付: ${targetRow.date}, URL: ${targetRow.url}`);

        const targetSheetId = getSheetIdFromUrl(targetRow.url);
        if (!targetSheetId) {
          console.log(`⚠️ 無効なURL: ${targetRow.url}`);
          results.push({
            rowIndex: targetRow.rowIndex,
            date: targetRow.date,
            error: 'Invalid sheet URL'
          });
          continue;
        }

        // 対象シートからA列（企業名）とD列（会話データ）を取得
        const response = await retryWithBackoff(async () => {
          return await sheets.spreadsheets.values.get({
            spreadsheetId: targetSheetId,
            range: 'A:D',
          });
        });

        const targetSheetRows = response.data.values;
        if (!targetSheetRows || targetSheetRows.length === 0) {
          console.log(`⚠️ データなし: ${targetRow.url}`);
          results.push({
            rowIndex: targetRow.rowIndex,
            date: targetRow.date,
            error: 'No data found in target sheet'
          });
          continue;
        }

        // A列から企業名を取得（最初の行）
        const companyName = targetSheetRows[0]?.[0] || '不明な企業';
        
        // D列から会話データを取得（すべての行）
        const conversationData = targetSheetRows
          .map(row => row[3])
          .filter(Boolean)
          .join('\n');

        if (!conversationData || conversationData.trim() === '会話データ') {
          console.log(`⚠️ 会話データなし: ${companyName}`);
          results.push({
            rowIndex: targetRow.rowIndex,
            date: targetRow.date,
            companyName,
            error: 'No conversation data found'
          });
          continue;
        }

        // 企業名を詳細に抽出
        const extractedCompanyName = extractCompanyNameDetailed(companyName).companyName;
        console.log(`抽出された企業名: ${extractedCompanyName}`);

        // Step 3: 課題抽出
        console.log('課題抽出を実行中...');
        const challengeResponse = await fetch(`${req.nextUrl.origin}/api/challenges/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: extractedCompanyName,
            conversationData,
            sourceUrl: targetRow.url
          }),
          signal: AbortSignal.timeout(10 * 60 * 1000), // 10分
        });

        if (!challengeResponse.ok) {
          const error = await challengeResponse.json();
          throw new Error(`課題抽出失敗: ${error.error}`);
        }

        const challengeResult = await challengeResponse.json();
        console.log('✅ 課題抽出完了');

        // Step 4: Snowflake AIマッチング
        console.log('Snowflake AIマッチングを実行中...');
        const matchResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: extractedCompanyName,
            challengeAnalysis: challengeResult.challenges
          }),
          signal: AbortSignal.timeout(5 * 60 * 1000), // 5分
        });

        if (!matchResponse.ok) {
          const error = await matchResponse.json();
          throw new Error(`マッチング失敗: ${error.error}`);
        }

        const matchResult = await matchResponse.json();
        console.log(`✅ マッチング完了: ${matchResult.matches?.length || 0}件のマッチ`);

        results.push({
          rowIndex: targetRow.rowIndex,
          date: targetRow.date,
          companyName: extractedCompanyName,
          originalCompanyName: companyName,
          challenges: challengeResult.challenges,
          challenge: challengeResult.challenges?.join('; ') || '', // write-resultsで使用される形式
          excludedSpeakers: '', // この処理では除外話者情報は取得していない
          matches: matchResult.matches || [],
          comprehensiveMatches: matchResult.matches || [], // write-resultsで使用される形式に合わせて追加
          totalMatches: matchResult.totalMatches || 0,
          sourceUrl: targetRow.url,
          success: true
        });

        // API制限対策のため、処理間に少し待機
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: unknown) {
        console.error(`行${targetRow.rowIndex}の処理エラー:`, error);
        const errorMessage = getErrorMessage(error);
        results.push({
          rowIndex: targetRow.rowIndex,
          date: targetRow.date,
          error: errorMessage
        });
      }
    }

    const successfulResults = results.filter(r => r.success);
    const totalMatches = successfulResults.reduce((sum, r) => sum + (r.totalMatches || 0), 0);

    console.log(`\n=== 課題抽出とマッチング処理完了 ===`);
    console.log(`処理対象: ${targetRows.length}件`);
    console.log(`成功: ${successfulResults.length}件`);
    console.log(`エラー: ${results.length - successfulResults.length}件`);
    console.log(`総マッチ数: ${totalMatches}件`);

    return NextResponse.json({
      success: true,
      processedCompanies: results,
      totalProcessed: targetRows.length,
      successfulProcessed: successfulResults.length,
      totalMatches,
      message: `課題抽出とマッチング処理が完了しました（${successfulResults.length}/${targetRows.length}件成功）`
    });

  } catch (error: unknown) {
    console.error('課題抽出とマッチング処理エラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json(
      { error: `課題抽出とマッチング処理失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
