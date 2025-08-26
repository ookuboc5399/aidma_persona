import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    console.log('=== 統合抽出テスト開始 ===');
    
    const testData = {
      companyName: "古川電気工業株式会社",
      conversationData: `
【定例】SP：古川電気工業株式会社様｜

参加者: 田中社長、佐藤部長、山田主任

田中社長: 今日は、当社の現在の課題について話し合いましょう。まず、佐藤部長から現状報告をお願いします。

佐藤部長: はい、現在の課題を整理しました。まず、人材不足の問題があります。技術者の採用が難しく、特に若手エンジニアの確保が課題です。また、既存の技術者のスキルアップも必要です。

山田主任: 私からも追加で、システムの老朽化について報告します。現在使用している製造システムが10年以上前のもので、新しい技術に対応できていません。これにより、生産効率が低下し、競合他社との差が広がっています。

田中社長: なるほど、人材とシステムの両面で課題があるということですね。他には？

佐藤部長: はい、もう一つ重要な課題があります。顧客からの要望が多様化しており、従来の製品では対応できなくなっています。新しい製品開発が必要ですが、開発リソースが不足している状況です。

山田主任: また、品質管理の面でも課題があります。現在の検査システムでは、細かい品質チェックができず、不良品の流出リスクがあります。

田中社長: これらの課題を解決するために、どのような対策が必要でしょうか？

佐藤部長: まず、人材面では、採用活動の強化と社内研修の充実が必要です。システム面では、製造システムの更新と、新しい品質管理システムの導入を検討すべきです。

山田主任: 製品開発については、外部の技術パートナーとの連携も検討できると思います。
`,
      sourceUrl: "https://docs.google.com/spreadsheets/d/test"
    };

    console.log('テストデータ:', {
      companyName: testData.companyName,
      conversationDataLength: testData.conversationData.length,
      conversationDataPreview: testData.conversationData.substring(0, 200) + '...'
    });

    // 統合抽出APIを呼び出し
    const response = await fetch(`${req.nextUrl.origin}/api/extract/company-and-challenges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    
    console.log('=== 統合抽出テスト結果 ===');
    console.log('Status:', response.status);
    console.log('Success:', result.success);
    
    if (result.success) {
      console.log('抽出された企業情報:', result.companyInfo);
      console.log('抽出された課題数:', result.challengeAnalysis?.challenges?.length || 0);
      console.log('処理情報:', result.processingInfo);
    } else {
      console.log('エラー:', result.error);
    }

    return NextResponse.json({
      success: true,
      testData,
      extractionResult: result,
      summary: {
        status: response.status,
        success: result.success,
        hasCompanyInfo: !!result.companyInfo,
        challengesCount: result.challengeAnalysis?.challenges?.length || 0,
        hasError: !result.success,
        error: result.error
      }
    });

  } catch (error: unknown) {
    console.error('統合抽出テストエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Unified extraction test failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
