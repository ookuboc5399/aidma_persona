import { NextRequest, NextResponse } from 'next/server';

// テスト用のサンプルデータ
const sampleConversationData = `
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
`;

export async function POST(req: NextRequest) {
  try {
    console.log('=== 統合テスト開始 ===');
    
    const testData = {
      companyName: "テスト企業株式会社",
      conversationData: sampleConversationData,
      sourceUrl: "https://docs.google.com/spreadsheets/d/test"
    };

    console.log('テストデータ:', {
      companyName: testData.companyName,
      conversationDataLength: testData.conversationData.length,
      conversationDataPreview: testData.conversationData.substring(0, 200) + '...'
    });

    const results: {
      step1: { success: boolean; data: any; error: string | null };
      step2: { success: boolean; data: any; error: string | null };
      step3: { success: boolean; data: any; error: string | null; isDuplicate?: boolean };
      step4: { success: boolean; data: any; error: string | null };
    } = {
      step1: { success: false, data: null, error: null },
      step2: { success: false, data: null, error: null },
      step3: { success: false, data: null, error: null },
      step4: { success: false, data: null, error: null }
    };

    // Step 1: 企業情報と課題の統合抽出
    console.log('\n=== Step 1: 企業情報と課題の統合抽出 ===');
    try {
      const extractResponse = await fetch(`${req.nextUrl.origin}/api/extract/company-and-challenges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData),
      });
      
      const extractResult = await extractResponse.json();
      results.step1 = {
        success: extractResponse.ok && extractResult.success,
        data: extractResult,
        error: extractResult.error
      };
      
      console.log('統合抽出結果:', results.step1.success ? '成功' : '失敗');
      if (results.step1.success) {
        console.log('抽出された企業情報:', extractResult.companyInfo);
        console.log('抽出された課題数:', extractResult.challengeAnalysis?.challenges?.length || 0);
      }
    } catch (error) {
      results.step1.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('統合抽出エラー:', error);
    }

    // Step 2: 課題抽出（統合抽出で既に完了しているため、スキップ）
    console.log('\n=== Step 2: 課題抽出（統合抽出で完了済み） ===');
    if (results.step1.success) {
      results.step2 = {
        success: true,
        data: {
          success: true,
          challengeId: "unified-extraction",
          companyName: testData.companyName,
          extractedChallenges: results.step1.data.extractedChallenges,
          challenges: results.step1.data.challenges,
          processingInfo: results.step1.data.processingInfo
        },
        error: null
      };
      console.log('統合抽出で課題も抽出済み');
    } else {
      results.step2 = {
        success: false,
        data: null,
        error: '統合抽出が失敗したため、課題抽出も失敗'
      };
      console.log('統合抽出が失敗したため、課題抽出も失敗');
    }

    // Step 3: Snowflakeに企業情報と課題を保存
    console.log('\n=== Step 3: Snowflakeに企業情報と課題を保存 ===');
    try {
      const storeData = {
        companyName: testData.companyName,
        sourceUrl: testData.sourceUrl,
        companyInfo: results.step1.success ? results.step1.data.companyInfo : null,
        challenges: results.step1.success ? results.step1.data.challenges : null
      };
      
      const storeResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storeData),
      });
      
                        const storeResult = await storeResponse.json();
                  results.step3 = {
                    success: storeResponse.ok && storeResult.success,
                    data: storeResult,
                    error: storeResult.error,
                    isDuplicate: storeResponse.status === 409
                  };
                  
                  console.log('Snowflake保存結果:', results.step3.success ? '成功' : '失敗');
                  if (results.step3.success) {
                    console.log('保存されたデータ:', storeResult.message);
                  } else if (results.step3.isDuplicate) {
                    console.log('企業名重複を検出:', storeResult.message);
                  }
    } catch (error) {
      results.step3.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('Snowflake保存エラー:', error);
    }

    // Step 4: Snowflake内でマッチング企業を検索
    console.log('\n=== Step 4: Snowflake内でマッチング企業を検索 ===');
    try {
      // 課題キーワードを抽出
      const challengeKeywords = results.step2.success && results.step2.data.challenges?.challenges 
        ? results.step2.data.challenges.challenges.flatMap((challenge: any) => challenge.keywords || [])
        : [];
      
      const matchData = {
        companyName: testData.companyName,
        challengeKeywords: challengeKeywords
      };
      
      const matchResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/internal-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matchData),
      });
      
      const matchResult = await matchResponse.json();
      results.step4 = {
        success: matchResponse.ok && matchResult.success,
        data: matchResult,
        error: matchResult.error
      };
      
      console.log('マッチング結果:', results.step4.success ? '成功' : '失敗');
      if (results.step4.success) {
        console.log('マッチした企業数:', matchResult.matches?.length || 0);
        console.log('マッチした企業:', matchResult.matches);
      }
    } catch (error) {
      results.step4.error = error instanceof Error ? error.message : 'Unknown error';
      console.error('マッチングエラー:', error);
    }

    // テスト結果のサマリー
    const summary = {
      totalSteps: 4,
      successfulSteps: Object.values(results).filter(r => r.success).length,
      failedSteps: Object.values(results).filter(r => !r.success).length,
      stepDetails: results
    };

    console.log('\n=== 統合テスト結果サマリー ===');
    console.log(`成功: ${summary.successfulSteps}/4`);
    console.log(`失敗: ${summary.failedSteps}/4`);

    return NextResponse.json({
      success: summary.successfulSteps === 4,
      summary,
      detailedResults: results
    });

  } catch (error: unknown) {
    console.error('統合テストエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Integration test failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
