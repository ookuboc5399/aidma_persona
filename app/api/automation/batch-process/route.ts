import { NextRequest, NextResponse } from 'next/server';

/**
 * バッチ処理API - 定期実行で未処理のデータをチェックして自動処理
 * cron jobやGitHub Actionsから呼び出される想定
 */

interface BatchProcessConfig {
  // 処理対象のスプレッドシート設定
  spreadsheetId: string;
  resultSpreadsheetId: string;
  sheetTypes: ('CL' | 'CU' | 'CP')[];
  // 何日前までのデータを対象とするか
  daysBack: number;
  // 処理済みフラグをチェックするかどうか
  checkProcessedFlag: boolean;
}

const DEFAULT_CONFIG: BatchProcessConfig = {
  spreadsheetId: '1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY',
  resultSpreadsheetId: '1jiead_e52qCXW2zU0ohqJwLqdbb2OyhpAg1urVJEVCY',
  sheetTypes: ['CL', 'CU', 'CP'],
  daysBack: 7, // 過去7日分をチェック
  checkProcessedFlag: true
};

export async function POST(req: NextRequest) {
  try {
    const requestBody = await req.json().catch(() => ({}));
    const config: BatchProcessConfig = { ...DEFAULT_CONFIG, ...requestBody };

    console.log('=== バッチ処理開始 ===');
    console.log('設定:', config);

    const results = [];
    let totalProcessed = 0;
    let totalErrors = 0;

    // 各シートタイプを処理
    for (const sheetType of config.sheetTypes) {
      console.log(`\n--- ${sheetType}シートの処理開始 ---`);
      
      try {
        // 1. 対象日付を取得
        const availableDates = await getAvailableDates(config.spreadsheetId, sheetType);
        console.log(`${sheetType}シート: ${availableDates.length}日分のデータを発見`);

        // 2. 未処理のデータをフィルタリング
        const unprocessedDates = await filterUnprocessedDates(
          availableDates, 
          config.daysBack, 
          config.checkProcessedFlag
        );
        console.log(`${sheetType}シート: ${unprocessedDates.length}日分が未処理`);

        // 3. 各日付を処理
        for (const dateInfo of unprocessedDates) {
          console.log(`${sheetType}シート ${dateInfo.date} の処理開始`);
          
          try {
            const processResult = await processDateData(
              sheetType,
              dateInfo.date,
              config.spreadsheetId,
              config.resultSpreadsheetId
            );

            results.push({
              sheetType,
              date: dateInfo.date,
              success: true,
              processedCompanies: processResult.processedCompanies,
              totalMatches: processResult.totalMatches
            });

            totalProcessed++;
            console.log(`✅ ${sheetType}シート ${dateInfo.date} 処理完了`);

            // API制限を避けるため少し待機
            await new Promise(resolve => setTimeout(resolve, 2000));

          } catch (error) {
            console.error(`❌ ${sheetType}シート ${dateInfo.date} 処理エラー:`, error);
            
            results.push({
              sheetType,
              date: dateInfo.date,
              success: false,
              error: error instanceof Error ? error.message : String(error)
            });

            totalErrors++;
          }
        }

      } catch (error) {
        console.error(`${sheetType}シート全体の処理エラー:`, error);
        
        results.push({
          sheetType,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });

        totalErrors++;
      }
    }

    console.log('\n=== バッチ処理完了 ===');
    console.log(`処理成功: ${totalProcessed}件`);
    console.log(`処理エラー: ${totalErrors}件`);

    return NextResponse.json({
      success: true,
      message: 'バッチ処理が完了しました',
      summary: {
        totalProcessed,
        totalErrors,
        totalAttempts: totalProcessed + totalErrors
      },
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('バッチ処理全体エラー:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * 利用可能な日付を取得
 */
async function getAvailableDates(spreadsheetId: string, sheetType: 'CL' | 'CU' | 'CP') {
  const sheetUrl = generateSheetUrl(spreadsheetId, sheetType);
  
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/sheets/get-${sheetType.toLowerCase()}-dates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: sheetUrl })
  });

  if (!response.ok) {
    throw new Error(`日付取得失敗 (${sheetType}): ${await response.text()}`);
  }

  const result = await response.json();
  return result.dates || [];
}

/**
 * 未処理のデータをフィルタリング
 */
async function filterUnprocessedDates(
  dates: any[], 
  daysBack: number, 
  checkProcessedFlag: boolean
): Promise<any[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  return dates.filter(dateInfo => {
    // 日付フィルター
    const dateObj = new Date(dateInfo.date);
    if (dateObj < cutoffDate) {
      return false;
    }

    // 処理済みフラグのチェック（将来的に実装）
    if (checkProcessedFlag) {
      // TODO: 処理済みフラグをチェックする仕組みを実装
      // 現在は全て未処理として扱う
    }

    return true;
  });
}

/**
 * 指定日付のデータを処理
 */
async function processDateData(
  sheetType: 'CL' | 'CU' | 'CP',
  date: string,
  spreadsheetId: string,
  resultSpreadsheetId: string
) {
  const sheetUrl = generateSheetUrl(spreadsheetId, sheetType);

  // 課題抽出・マッチング処理を実行
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process/challenge-matching-by-date`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      url: sheetUrl,
      sheetType
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`課題抽出・マッチング処理失敗: ${error}`);
  }

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(`課題抽出・マッチング処理失敗: ${result.message || 'Unknown error'}`);
  }

  // 結果をスプレッドシートに書き込み
  if (result.results && result.results.length > 0) {
    const resultSheetUrl = `https://docs.google.com/spreadsheets/d/${resultSpreadsheetId}/edit`;
    
    const writeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/sheets/write-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: resultSheetUrl,
        results: result.results
      })
    });

    if (!writeResponse.ok) {
      console.warn(`結果書き込み警告: ${await writeResponse.text()}`);
    }
  }

  return {
    processedCompanies: result.results?.length || 0,
    totalMatches: result.results?.reduce((sum: number, r: any) => sum + (r.matches?.length || 0), 0) || 0
  };
}

/**
 * シートURLを生成
 */
function generateSheetUrl(spreadsheetId: string, sheetType: 'CL' | 'CU' | 'CP'): string {
  const baseUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?pli=1`;
  
  const gidMapping = {
    'CL': '0',
    'CU': '609102789', 
    'CP': '1336297365'
  };
  
  const gid = gidMapping[sheetType];
  return `${baseUrl}&gid=${gid}#gid=${gid}`;
}

/**
 * ヘルスチェック用のGETエンドポイント
 */
export async function GET() {
  return NextResponse.json({
    status: 'ready',
    message: 'バッチ処理APIは正常に動作しています',
    endpoints: {
      'POST /api/automation/batch-process': 'バッチ処理を実行',
      'GET /api/automation/batch-process': 'ヘルスチェック'
    },
    defaultConfig: DEFAULT_CONFIG
  });
}
