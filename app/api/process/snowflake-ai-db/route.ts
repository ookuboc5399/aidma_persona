import { NextRequest, NextResponse } from 'next/server';
import { extractCompanyNameDetailed } from '../../../../lib/utils';

// 既存データを使用してマッチングを続行する関数
async function continueWithExistingData(
  companyName: string, 
  extractResult: any, 
  req: NextRequest
) {
  try {
    console.log('\n=== Step 3: 既存データを使用したSnowflake AI マッチング ===');
    
    // 既存データから課題キーワードを抽出
    const challengeKeywords = extractResult.challenges?.challenges 
      ? extractResult.challenges.challenges.flatMap((challenge: any) => challenge.keywords || [])
      : [];

    const matchResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/internal-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName,
        challengeKeywords
      }),
      signal: AbortSignal.timeout(3 * 60 * 1000), // 3分
    });

    if (!matchResponse.ok) {
      const error = await matchResponse.json();
      throw new Error(`Snowflake AI マッチング失敗: ${error.error}`);
    }

    const matchResult = await matchResponse.json();
    console.log(`✅ Snowflake AI マッチング完了: ${matchResult.matches?.length || 0}件のマッチ`);

    return NextResponse.json({
      success: true,
      companyName,
      extractedChallenges: extractResult.extractedChallenges,
      challenges: extractResult.challenges,
      companyInfo: extractResult.companyInfo,
      matches: matchResult.matches || [],
      totalMatches: matchResult.totalMatches || 0,
      dataSource: 'snowflake',
      matchingMethod: 'snowflake-ai',
      duplicateHandled: true,
      processingInfo: {
        steps: [
          '企業情報と課題の統合抽出',
          '企業名重複を検出（既存データを使用）',
          'Snowflake AI マッチング'
        ],
        model: 'snowflake-ai'
      }
    });

  } catch (error: unknown) {
    console.error('既存データを使用したマッチングエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `既存データを使用したマッチング失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl, originalCompanyName } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    console.log('=== Snowflake + Snowflake AI + DB 処理開始 ===');
    console.log(`企業名: ${companyName}`);
    console.log(`元の企業名: ${originalCompanyName}`);
    console.log(`会話データ長: ${conversationData.length}`);

    // Step 1: 企業名を抽出（会議タイトルから）
    const extractedCompanyName = originalCompanyName ? extractCompanyNameDetailed(originalCompanyName).companyName : companyName;
    console.log(`抽出された企業名: ${extractedCompanyName}`);

    // Step 2: 企業情報と課題の統合抽出
    console.log('\n=== Step 1: 企業情報と課題の統合抽出 ===');
    const extractResponse = await fetch(`${req.nextUrl.origin}/api/extract/company-and-challenges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: extractedCompanyName,
        conversationData,
        sourceUrl
      }),
      signal: AbortSignal.timeout(15 * 60 * 1000), // 15分
    });

    if (!extractResponse.ok) {
      const error = await extractResponse.json();
      throw new Error(`統合抽出失敗: ${error.error}`);
    }

    const extractResult = await extractResponse.json();
    console.log('✅ 企業情報と課題の統合抽出完了');

    // Step 3: 企業情報と課題をSnowflakeに保存
    console.log('\n=== Step 2: 企業情報と課題をSnowflakeに保存 ===');
    const storeResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: extractedCompanyName,
        sourceUrl,
        companyInfo: extractResult.companyInfo,
        challenges: extractResult.challenges
      }),
      signal: AbortSignal.timeout(2 * 60 * 1000), // 2分
    });

    if (!storeResponse.ok) {
      const error = await storeResponse.json();
      
      // 重複エラーの場合は特別に処理
      if (storeResponse.status === 409) {
        console.log(`⚠️ 企業名重複: ${error.message}`);
        console.log('既存データを使用してマッチングを続行します');
        
        // 既存データを取得してマッチングを続行
        return await continueWithExistingData(extractedCompanyName, extractResult, req);
      }
      
      throw new Error(`Snowflake保存失敗: ${error.error}`);
    }

    const storeResult = await storeResponse.json();
    console.log('✅ 企業情報と課題をSnowflakeに保存完了');

    // Step 4: Snowflake AI マッチング
    console.log('\n=== Step 3: Snowflake AI マッチング ===');
    const challengeKeywords = extractResult.challenges?.challenges 
      ? extractResult.challenges.challenges.flatMap((challenge: any) => challenge.keywords || [])
      : [];

    const matchResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/internal-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: extractedCompanyName,
        challengeKeywords
      }),
      signal: AbortSignal.timeout(3 * 60 * 1000), // 3分
    });

    if (!matchResponse.ok) {
      const error = await matchResponse.json();
      throw new Error(`Snowflake AI マッチング失敗: ${error.error}`);
    }

    const matchResult = await matchResponse.json();
    console.log(`✅ Snowflake AI マッチング完了: ${matchResult.matches?.length || 0}件のマッチ`);

    return NextResponse.json({
      success: true,
      companyName: extractedCompanyName,
      extractedChallenges: extractResult.extractedChallenges,
      challenges: extractResult.challenges,
      companyInfo: extractResult.companyInfo,
      matches: matchResult.matches || [],
      totalMatches: matchResult.totalMatches || 0,
      dataSource: 'snowflake',
      matchingMethod: 'snowflake-ai',
      processingInfo: {
        steps: [
          '企業情報と課題の統合抽出',
          '企業情報と課題をSnowflakeに保存',
          'Snowflake AI マッチング'
        ],
        model: 'snowflake-ai'
      }
    });

  } catch (error: unknown) {
    console.error('Snowflake + Snowflake AI + DB 処理エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Snowflake + Snowflake AI + DB 処理失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
