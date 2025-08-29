import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '../../../../lib/google';
import { 
  extractMultipleCompaniesFromConversation,
  extractMeetingTitleFromConversation 
} from '../../../../lib/company-extractor';

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

// 特定企業の会話データ部分を抽出する関数
function extractCompanySpecificConversation(fullConversationData: string, meetingTitle: string): string {
  try {
    // 会議タイトルを含む部分から次の会議タイトルまでを抽出
    const titleIndex = fullConversationData.indexOf(meetingTitle);
    if (titleIndex === -1) {
      // タイトルが見つからない場合は全データを返す
      return fullConversationData;
    }
    
    // 次の "会議タイトル:" を探す
    const nextTitleIndex = fullConversationData.indexOf('会議タイトル:', titleIndex + meetingTitle.length);
    
    if (nextTitleIndex === -1) {
      // 次のタイトルがない場合は最後まで
      return fullConversationData.substring(titleIndex);
    } else {
      // 次のタイトルの直前まで
      return fullConversationData.substring(titleIndex, nextTitleIndex).trim();
    }
  } catch (error) {
    console.error('会話データ抽出エラー:', error);
    return fullConversationData;
  }
}

export async function POST(req: NextRequest) {
  try {
    const sheets = getSheetsClient();
    const { date, url } = await req.json();
    
    if (!date || !url) {
      return NextResponse.json({ error: 'Date and URL are required' }, { status: 400 });
    }

    const sheetId = getSheetIdFromUrl(url);
    if (!sheetId) {
      return NextResponse.json({ error: 'Invalid sheet URL' }, { status: 400 });
    }

    console.log(`=== ${date}の企業別データ取得開始 ===`);
    console.log(`シートID: ${sheetId}`);

    // 全てのデータを取得（列ごとに企業データが格納されている）
    const response = await retryWithBackoff(async () => {
      return await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'A:Z', // A〜Z列まで取得して企業データを検出
      });
    });

    const allRows = response.data.values;
    if (!allRows || allRows.length === 0) {
      return NextResponse.json({
        error: 'No data found in target sheet',
        companies: []
      }, { status: 404 });
    }

    console.log(`取得した行数: ${allRows.length}`);
    console.log(`最初の行のデータ数: ${allRows[0]?.length || 0}`);

    // D列（会話データ列）を特別に処理
    const companies = [];
    const maxColumns = Math.max(...allRows.map(row => row?.length || 0));
    
    for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
      // 各列の1行目を列名として取得
      const columnHeader = allRows[0]?.[colIndex];
      
      if (!columnHeader || columnHeader.trim() === '') {
        continue; // 空の列はスキップ
      }

      // その列のデータを取得（2行目以降）
      const dataRows = [];
      for (let rowIndex = 1; rowIndex < allRows.length; rowIndex++) {
        const cellData = allRows[rowIndex]?.[colIndex];
        if (cellData && cellData.trim() !== '') {
          dataRows.push(cellData);
        }
      }

      // データが存在する場合のみ処理
      if (dataRows.length > 0) {
        const fullData = dataRows.join('\n');
        
        // D列（会話データ）の場合は特別処理
        if (columnHeader.includes('会話データ') || colIndex === 3) {
          console.log('=== D列（会話データ）の処理開始 ===');
          
          // 会話データから複数の企業を抽出
          const extractedCompanies = extractMultipleCompaniesFromConversation(fullData);
          
          console.log(`抽出された企業数: ${extractedCompanies.length}`);
          
          if (extractedCompanies.length > 0) {
            // 各企業ごとに会話データを分割
            extractedCompanies.forEach((companyInfo, index) => {
              // 該当企業の会話データ部分を抽出
              const companyConversationData = extractCompanySpecificConversation(fullData, companyInfo.rawTitle);
              
              companies.push({
                columnIndex: colIndex,
                subIndex: index, // 同一列内での企業インデックス
                companyName: companyInfo.companyName,
                originalTitle: companyInfo.rawTitle,
                meetingType: companyInfo.meetingType,
                confidence: companyInfo.confidence,
                conversationData: companyConversationData,
                conversationLength: companyConversationData.length,
                conversationLines: companyConversationData.split('\n').length,
                sourceUrl: url,
                date,
                isExtractedFromConversation: true
              });
              
              console.log(`企業${index + 1}: ${companyInfo.companyName} (信頼度: ${companyInfo.confidence})`);
            });
          } else {
            // 企業抽出に失敗した場合は元の処理
            companies.push({
              columnIndex: colIndex,
              companyName: columnHeader.trim(),
              conversationData: fullData,
              conversationLength: fullData.length,
              conversationLines: dataRows.length,
              sourceUrl: url,
              date,
              isExtractedFromConversation: false
            });
          }
        }
      }
    }

    console.log(`✅ 企業データ抽出完了: ${companies.length}社を発見`);
    companies.forEach((company, index) => {
      console.log(`${index + 1}. ${company.companyName} (列${String.fromCharCode(65 + company.columnIndex)}, ${company.conversationLines}行, ${company.conversationLength}文字)`);
    });

    return NextResponse.json({
      success: true,
      date,
      companies,
      totalCompanies: companies.length,
      message: `${date}の${companies.length}社の企業データを取得しました`
    });

  } catch (error: unknown) {
    console.error('企業別データ取得エラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
