import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl, useSnowflakeAI = false } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    // ステップ1: ChatGPTで課題抽出
    const challengeResponse = await fetch(`${req.nextUrl.origin}/api/challenges/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName,
        conversationData,
        sourceUrl,
      }),
    });

    if (!challengeResponse.ok) {
      const error = await challengeResponse.json();
      throw new Error(`Challenge extraction failed: ${error.error}`);
    }

    const challengeResult = await challengeResponse.json();
    const { extractedChallenges, challengeAnalysis, processingInfo } = challengeResult;

    // ステップ2: Snowflakeにデータ格納
    const storeResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName,
        conversationData,
        sourceUrl,
        extractedChallenges,
        challengeAnalysis,
      }),
    });

    if (!storeResponse.ok) {
      console.warn('Failed to store in Snowflake, continuing with external matching');
    }

    // ステップ3: マッチング実行（選択可能）
    let matchingResult;
    if (useSnowflakeAI) {
      // Snowflake内AIマッチング
      const snowflakeAIResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/ai-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
        }),
      });

      if (!snowflakeAIResponse.ok) {
        throw new Error('Snowflake AI matching failed');
      }

      matchingResult = await snowflakeAIResponse.json();
    } else {
      // 外部ChatGPTマッチング
      const externalMatchingResponse = await fetch(`${req.nextUrl.origin}/api/matching/snowflake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeResult.challengeId,
        }),
      });

      if (!externalMatchingResponse.ok) {
        throw new Error('External matching failed');
      }

      matchingResult = await externalMatchingResponse.json();
    }

    return NextResponse.json({
      success: true,
      companyName,
      extractedChallenges,
      challengeAnalysis,
      matches: matchingResult.matches,
      totalMatches: matchingResult.totalMatches,
      dataSource: matchingResult.dataSource,
      matchingMethod: matchingResult.matchingMethod,
      processingInfo,
      snowflakeStored: storeResponse.ok
    });

  } catch (error: unknown) {
    console.error('Hybrid process error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Hybrid process failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
