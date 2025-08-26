import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    // ステップ1: 課題抽出
    const challengeResponse = await fetch(`${req.nextUrl.origin}/api/challenges/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName,
        conversationData,
        sourceUrl,
      }),
      signal: AbortSignal.timeout(15 * 60 * 1000), // 15分
    });

    if (!challengeResponse.ok) {
      const error = await challengeResponse.json();
      throw new Error(`Challenge extraction failed: ${error.error}`);
    }

    const challengeResult = await challengeResponse.json();
    const challengeId = challengeResult.challengeId;

    // ステップ2: Snowflakeテーブルにデータを保存
    console.log('Step 2: Storing data to Snowflake...');
    const snowflakeStoreResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName,
        conversationData,
        sourceUrl,
        extractedChallenges: challengeResult.extractedChallenges,
        challengeAnalysis: challengeResult.challengeAnalysis,
      }),
    });

    if (!snowflakeStoreResponse.ok) {
      const error = await snowflakeStoreResponse.json();
      throw new Error(`Snowflake store failed: ${error.error}`);
    }

    const storeResult = await snowflakeStoreResponse.json();
    console.log('✅ Snowflake data storage completed');

    // ステップ3: Snowflakeマッチング実行
    const matchingResponse = await fetch(`${req.nextUrl.origin}/api/matching/snowflake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId,
      }),
    });

    if (!matchingResponse.ok) {
      const error = await matchingResponse.json();
      throw new Error(`Snowflake matching failed: ${error.error}`);
    }

    const matchingResult = await matchingResponse.json();

    return NextResponse.json({
      success: true,
      challengeId,
      companyName,
      extractedChallenges: challengeResult.extractedChallenges,
      challengeAnalysis: challengeResult.challengeAnalysis,
      matches: matchingResult.matches,
      totalMatches: matchingResult.totalMatches,
      snowflakeCandidates: matchingResult.snowflakeCandidates,
      dataSource: 'snowflake'
    });

  } catch (error: unknown) {
    console.error('Snowflake full process error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Snowflake process failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
