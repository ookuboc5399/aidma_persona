import { NextRequest, NextResponse } from 'next/server';
import { 
  extractMultipleCompaniesFromConversation,
  extractMeetingTitleFromConversation,
  testCompanyExtraction
} from '../../../../lib/company-extractor';

export async function POST(req: NextRequest) {
  try {
    console.log('=== 企業名抽出テスト開始 ===');
    
    // テスト用の会話データ（7/18のサンプル）
    const sampleConversationData = `会議概要:

会議タイトル: 【取材】SP：株式会社オーダーメイドジャパン様
会議日時: 2025/07/18（金）10:00 - 10:30
参加者: CLアシスタント

文字起こし:

CLアシスタントさんのマイク_3 00:00:07
アレジ中だよ。

CLアシスタントさんのマイク_1 00:00:12
ありがとうございます。

会議概要:

会議タイトル: 【取材】SP：人光株式会社｜
会議日時: 2025/07/18（金）11:00 - 12:00
参加者: CLアシスタント

文字起こし:

CLアシスタントさんのマイク_1 00:00:05
人光株式会社の概要について説明します。

会議概要:

会議タイトル: 【取材】SP：HAJIME AGENCY様｜
会議日時: 2025/07/18（金）13:00 - 14:00
参加者: CLアシスタント

文字起こし:

CLアシスタントさんのマイク_2 00:00:10
HAJIME AGENCYのサービスについて。`;

    // 基本的な抽出テスト
    console.log('=== 基本抽出テスト ===');
    testCompanyExtraction();
    
    // 実際の会話データからの抽出テスト
    console.log('\n=== 実際の会話データからの抽出テスト ===');
    const extractedCompanies = extractMultipleCompaniesFromConversation(sampleConversationData);
    
    console.log(`抽出された企業数: ${extractedCompanies.length}`);
    
    const results = extractedCompanies.map((company, index) => {
      console.log(`${index + 1}. 企業名: "${company.companyName}"`);
      console.log(`   元タイトル: "${company.rawTitle}"`);
      console.log(`   会議タイプ: "${company.meetingType}"`);
      console.log(`   信頼度: ${company.confidence}`);
      console.log('---');
      
      return {
        index: index + 1,
        companyName: company.companyName,
        rawTitle: company.rawTitle,
        meetingType: company.meetingType,
        confidence: company.confidence
      };
    });
    
    // 各タイトルの抽出テスト
    console.log('\n=== 個別タイトル抽出テスト ===');
    const titles = [
      "【取材】SP：株式会社オーダーメイドジャパン様",
      "【取材】SP：人光株式会社｜",
      "【取材】SP：HAJIME AGENCY様｜",
      "【取材】SP：株式会社グローバルメンテナンス｜",
      "【取材】SP：iTec｜",
      "【取材】SP：株式会社2st planning｜ア(2)",
      "【取材】SP＋CM：cimagico｜様",
      "【取材】CM：株式会社一深建設｜様 深澤太郎"
    ];
    
    const titleExtractionResults = titles.map(title => {
      const firstTitleMatch = sampleConversationData.match(/会議タイトル:\s*(.+?)(?:\n|$)/);
      console.log(`"${title}" から抽出テスト実行中...`);
      return {
        originalTitle: title,
        // extractedTitle: extractMeetingTitleFromConversation(`会議タイトル: ${title}\n`)
      };
    });

    return NextResponse.json({
      success: true,
      testResults: {
        extractedCompanies: results,
        sampleDataAnalysis: {
          totalCompanies: extractedCompanies.length,
          highConfidenceCompanies: extractedCompanies.filter(c => c.confidence >= 0.8).length,
          mediumConfidenceCompanies: extractedCompanies.filter(c => c.confidence >= 0.6 && c.confidence < 0.8).length,
          lowConfidenceCompanies: extractedCompanies.filter(c => c.confidence < 0.6).length
        },
        titleTests: titleExtractionResults
      },
      message: `企業名抽出テスト完了。${extractedCompanies.length}社を抽出しました。`
    });

  } catch (error: unknown) {
    console.error('企業名抽出テストエラー:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ 
      success: false,
      error: errorMessage,
      message: `テスト実行中にエラーが発生しました: ${errorMessage}`
    }, { status: 500 });
  }
}
