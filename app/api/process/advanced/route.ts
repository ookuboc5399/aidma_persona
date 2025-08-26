import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { 
      companyName, 
      conversationData, 
      sourceUrl, 
      matchingMethod = 'chatgpt', // 'chatgpt' or 'snowflake'
      extractCompanyInfo = true 
    } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    const results: any = {
      companyName,
      sourceUrl,
      steps: []
    };

    // ステップ1: 企業情報抽出（オプション）
    if (extractCompanyInfo) {
      console.log('Step 1: Extracting company information...');
      const companyExtractionResponse = await fetch(`${req.nextUrl.origin}/api/companies/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          conversationData,
          sourceUrl,
        }),
      });

      if (companyExtractionResponse.ok) {
        const companyResult = await companyExtractionResponse.json();
        results.companyExtraction = companyResult;
        results.steps.push({
          step: 'company_extraction',
          status: 'success',
          message: companyResult.message,
          model_used: companyResult.model_used
        });
      } else {
        const error = await companyExtractionResponse.json();
        results.steps.push({
          step: 'company_extraction',
          status: 'error',
          message: error.error
        });
        console.warn('Company extraction failed, continuing with other steps');
      }
    }

    // ステップ2: 課題抽出
    console.log('Step 2: Extracting challenges...');
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
    results.challengeExtraction = challengeResult;
    results.steps.push({
      step: 'challenge_extraction',
      status: 'success',
      totalChunks: challengeResult.processingInfo?.totalChunks,
      model_used: challengeResult.processingInfo?.model
    });

    // ステップ3: マッチング実行（選択可能）
    console.log(`Step 3: Executing matching with method: ${matchingMethod}`);
    let matchingResult;
    
    if (matchingMethod === 'snowflake') {
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
      results.steps.push({
        step: 'matching',
        status: 'success',
        method: 'snowflake_ai',
        totalMatches: matchingResult.totalMatches
      });
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
        throw new Error('External ChatGPT matching failed');
      }

      matchingResult = await externalMatchingResponse.json();
      results.steps.push({
        step: 'matching',
        status: 'success',
        method: 'chatgpt_external',
        totalMatches: matchingResult.totalMatches
      });
    }

    // 結果を統合
    results.matching = matchingResult;
    results.extractedChallenges = challengeResult.extractedChallenges;
    results.challengeAnalysis = challengeResult.challengeAnalysis;
    results.totalMatches = matchingResult.totalMatches;
    results.dataSource = matchingResult.dataSource;
    results.matchingMethod = matchingMethod;

    return NextResponse.json({
      success: true,
      ...results
    });

  } catch (error: unknown) {
    console.error('Advanced process error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Advanced process failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
