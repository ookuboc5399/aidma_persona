import { NextRequest, NextResponse } from 'next/server';

/**
 * 自動処理API - Google Apps Scriptからの呼び出しを受けて
 * 新しいスプレッドシートデータの課題抽出・マッチング処理を実行
 */

interface AutoProcessRequest {
  sheetType: 'CL' | 'CU' | 'CP';
  date: string;
  spreadsheetId: string;
  resultSpreadsheetId: string;
}

export async function POST(req: NextRequest) {
  try {
    const { sheetType, date, spreadsheetId, resultSpreadsheetId }: AutoProcessRequest = await req.json();

    // 入力検証
    if (!sheetType || !date || !spreadsheetId) {
      return NextResponse.json({
        error: 'sheetType, date, and spreadsheetId are required'
      }, { status: 400 });
    }

    if (!['CL', 'CU', 'CP'].includes(sheetType)) {
      return NextResponse.json({
        error: 'Invalid sheetType. Must be CL, CU, or CP'
      }, { status: 400 });
    }

    console.log('=== 自動処理開始 ===');
    console.log(`シートタイプ: ${sheetType}`);
    console.log(`対象日付: ${date}`);
    console.log(`スプレッドシートID: ${spreadsheetId}`);
    console.log(`結果出力先ID: ${resultSpreadsheetId}`);

    // シートタイプに応じたURLを生成
    const sheetUrl = generateSheetUrl(spreadsheetId, sheetType);
    
    console.log(`生成されたシートURL: ${sheetUrl}`);

    // 1. 課題抽出・マッチング処理を実行
    console.log('課題抽出・マッチング処理を開始...');
    
    const processingResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process/challenge-matching-by-date`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date,
        url: sheetUrl,
        sheetType
      })
    });

    if (!processingResponse.ok) {
      const error = await processingResponse.text();
      throw new Error(`課題抽出・マッチング処理失敗: ${error}`);
    }

    const processingResult = await processingResponse.json();
    
    if (!processingResult.success) {
      throw new Error(`課題抽出・マッチング処理失敗: ${processingResult.message || 'Unknown error'}`);
    }

    console.log(`✅ 課題抽出・マッチング処理完了: ${processingResult.results?.length || 0}社を処理`);

    // 2. 結果をスプレッドシートに自動出力（結果出力先が指定されている場合）
    let writeResult = null;
    if (resultSpreadsheetId && processingResult.results && processingResult.results.length > 0) {
      console.log('結果をスプレッドシートに書き込み中...');
      
      const resultSheetUrl = `https://docs.google.com/spreadsheets/d/${resultSpreadsheetId}/edit`;
      
      const writeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/sheets/write-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: resultSheetUrl,
          results: processingResult.results
        })
      });

      if (writeResponse.ok) {
        writeResult = await writeResponse.json();
        console.log(`✅ 結果書き込み完了: ${writeResult.updatedRows || 0}行を追加`);
      } else {
        const writeError = await writeResponse.text();
        console.warn(`結果書き込み警告: ${writeError}`);
        // 書き込み失敗は警告として扱い、処理自体は成功とする
      }
    }

    // 3. 処理完了レスポンス
    const response = {
      success: true,
      message: '自動処理が正常に完了しました',
      sheetType,
      date,
      processedCompanies: processingResult.results?.length || 0,
      totalMatches: processingResult.results?.reduce((sum: number, result: any) => 
        sum + (result.matches?.length || 0), 0) || 0,
      processing: {
        success: true,
        results: processingResult.results?.length || 0
      },
      writing: writeResult ? {
        success: true,
        updatedRows: writeResult.updatedRows || 0
      } : {
        success: false,
        reason: 'No result spreadsheet specified or no results to write'
      },
      timestamp: new Date().toISOString()
    };

    console.log('=== 自動処理完了 ===');
    console.log(`処理企業数: ${response.processedCompanies}`);
    console.log(`総マッチ数: ${response.totalMatches}`);

    return NextResponse.json(response);

  } catch (error: unknown) {
    console.error('自動処理エラー:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * シートタイプとスプレッドシートIDからURLを生成
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
 * 手動テスト用のGET エンドポイント
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sheetType = searchParams.get('sheetType') as 'CL' | 'CU' | 'CP' | null;
  const date = searchParams.get('date');
  
  if (!sheetType || !date) {
    return NextResponse.json({
      error: 'Query parameters sheetType and date are required',
      example: '/api/automation/process-new-data?sheetType=CU&date=2025/09/04'
    }, { status: 400 });
  }

  // テスト用のデフォルト値
  const testRequest: AutoProcessRequest = {
    sheetType,
    date,
    spreadsheetId: '1pJQqCWrIBTp5JFxByoOOQt82qqQZ5AXz8cQgy1LHzZY',
    resultSpreadsheetId: '1jiead_e52qCXW2zU0ohqJwLqdbb2OyhpAg1urVJEVCY'
  };

  // POSTメソッドと同じ処理を実行
  const postRequest = new NextRequest(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testRequest)
  });

  return POST(postRequest);
}
