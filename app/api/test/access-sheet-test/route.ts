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
    
    // 7/18のスプレッドシートをテスト
    const testUrl = 'https://docs.google.com/spreadsheets/d/1Ir1MBRQAd1_pcBg2wjMxxiY0Doec4CARt2o5ztsLZKQ/edit';
    const testDate = '2025/07/18';

    console.log('=== 7/18スプレッドシートアクセステスト開始 ===');
    console.log(`テストURL: ${testUrl}`);
    console.log(`テスト日付: ${testDate}`);

    const sheetId = getSheetIdFromUrl(testUrl);
    if (!sheetId) {
      return NextResponse.json({ 
        error: 'Invalid sheet URL',
        testUrl,
        extractedSheetId: null
      }, { status: 400 });
    }

    console.log(`抽出されたシートID: ${sheetId}`);

    // まずはシートの基本情報を取得
    try {
      const sheetInfo = await retryWithBackoff(async () => {
        return await sheets.spreadsheets.get({
          spreadsheetId: sheetId,
        });
      });

      console.log('✅ シートの基本情報取得成功');
      console.log(`シート名: ${sheetInfo.data.properties?.title}`);
      console.log(`シート数: ${sheetInfo.data.sheets?.length}`);

      // 全てのデータを取得（A〜Z列）
      const response = await retryWithBackoff(async () => {
        return await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: 'A:Z',
        });
      });

      const allRows = response.data.values;
      if (!allRows || allRows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No data found in target sheet',
          sheetInfo: {
            title: sheetInfo.data.properties?.title,
            sheetCount: sheetInfo.data.sheets?.length,
            sheetId: sheetId
          }
        });
      }

      console.log(`✅ データ取得成功`);
      console.log(`行数: ${allRows.length}`);
      console.log(`最初の行の列数: ${allRows[0]?.length || 0}`);

      // 各列をチェックして企業データを抽出
      const companies = [];
      const maxColumns = Math.max(...allRows.map(row => row?.length || 0));
      
      console.log(`最大列数: ${maxColumns}`);

      for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
        // 各列の1行目を企業名として取得
        const companyName = allRows[0]?.[colIndex];
        
        if (!companyName || companyName.trim() === '') {
          continue; // 空の列はスキップ
        }

        // その列の会話データを取得（2行目以降）
        const conversationRows = [];
        for (let rowIndex = 1; rowIndex < allRows.length; rowIndex++) {
          const cellData = allRows[rowIndex]?.[colIndex];
          if (cellData && cellData.trim() !== '') {
            conversationRows.push(cellData);
          }
        }

        // 会話データが存在する場合のみ企業として追加
        if (conversationRows.length > 0) {
          const conversationData = conversationRows.join('\n');
          
          companies.push({
            columnIndex: colIndex,
            columnLetter: String.fromCharCode(65 + colIndex),
            companyName: companyName.trim(),
            conversationData: conversationData.substring(0, 500) + '...', // テスト用に500文字まで
            conversationLength: conversationData.length,
            conversationLines: conversationRows.length,
            sourceUrl: testUrl,
            date: testDate
          });

          console.log(`企業発見: 列${String.fromCharCode(65 + colIndex)} - ${companyName.trim()} (${conversationRows.length}行, ${conversationData.length}文字)`);
        }
      }

      console.log(`✅ 企業データ抽出完了: ${companies.length}社を発見`);

      return NextResponse.json({
        success: true,
        accessTest: {
          canAccessSheet: true,
          sheetId,
          url: testUrl,
          date: testDate
        },
        sheetInfo: {
          title: sheetInfo.data.properties?.title,
          sheetCount: sheetInfo.data.sheets?.length,
          totalRows: allRows.length,
          maxColumns
        },
        companies,
        totalCompanies: companies.length,
        message: `7/18のスプレッドシートに正常にアクセスでき、${companies.length}社の企業データを取得しました`
      });

    } catch (sheetError) {
      console.error('シートアクセスエラー:', sheetError);
      
      return NextResponse.json({
        success: false,
        accessTest: {
          canAccessSheet: false,
          sheetId,
          url: testUrl,
          date: testDate,
          error: getErrorMessage(sheetError)
        },
        message: `7/18のスプレッドシートにアクセスできませんでした: ${getErrorMessage(sheetError)}`
      }, { status: 500 });
    }

  } catch (error: unknown) {
    console.error('全体エラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ 
      success: false,
      error: errorMessage,
      message: `テスト実行中にエラーが発生しました: ${errorMessage}`
    }, { status: 500 });
  }
}
