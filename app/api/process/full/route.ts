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
    });

    if (!challengeResponse.ok) {
      const error = await challengeResponse.json();
      throw new Error(`Challenge extraction failed: ${error.error}`);
    }

    const challengeResult = await challengeResponse.json();
    const challengeId = challengeResult.challengeId;

    // ステップ2: マッチング実行
    const matchingResponse = await fetch(`${req.nextUrl.origin}/api/matching/find`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId,
      }),
    });

    if (!matchingResponse.ok) {
      const error = await matchingResponse.json();
      throw new Error(`Matching failed: ${error.error}`);
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
    });

  } catch (error: unknown) {
    console.error('Full process error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Process failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
