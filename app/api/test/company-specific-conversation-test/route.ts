import { NextRequest, NextResponse } from 'next/server';
import { extractCompanySpecificConversation } from '../../../../lib/company-extractor';

export async function POST(req: NextRequest) {
  try {
    // サンプルの会話データ（複数企業が含まれる）
    const testData = `会議タイトル: 【取材】SP：株式会社GLAPentertainment｜
小林 太郎 00:00:00
株式会社GLAPentertainmentについてお聞きします。

会議タイトル: 【取材】SP：よくばり売却 新宿店｜
佐藤 花子 00:10:00
よくばり売却 新宿店についてお聞きします。

山田 次郎 00:15:00
よくばり売却についてもう少し詳しく教えてください。`;

    console.log('=== 企業特定会話抽出テスト開始 ===');
    console.log(`元データ: ${testData.length}文字`);

    // 1. 株式会社GLAPentertainmentのデータを抽出
    const glapData = extractCompanySpecificConversation(testData, '株式会社GLAPentertainment');
    
    // 2. よくばり売却 新宿店のデータを抽出
    const yokubaData = extractCompanySpecificConversation(testData, 'よくばり売却 新宿店');

    return NextResponse.json({
      success: true,
      originalData: {
        content: testData,
        length: testData.length
      },
      extractedData: {
        glap: {
          companyName: '株式会社GLAPentertainment',
          content: glapData,
          length: glapData.length
        },
        yokubari: {
          companyName: 'よくばり売却 新宿店',
          content: yokubaData,
          length: yokubaData.length
        }
      },
      comparison: {
        originalLength: testData.length,
        glapReduction: Math.round((1 - glapData.length / testData.length) * 100),
        yokubariReduction: Math.round((1 - yokubaData.length / testData.length) * 100)
      }
    });

  } catch (error: unknown) {
    console.error('Company specific conversation test error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    }, { status: 500 });
  }
}
