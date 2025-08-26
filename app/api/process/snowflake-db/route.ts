import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl, extractCompanyInfo = true } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    console.log('=== Snowflake DB Processing Start ===');
    console.log(`Processing company: ${companyName}`);
    console.log(`Source URL: ${sourceUrl}`);

    const results: any = {
      companyName,
      sourceUrl,
      steps: []
    };

    // ステップ1: 企業情報抽出（オプション）
    if (extractCompanyInfo) {
      console.log('\nStep 1: Extracting company information...');
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
        console.log('✅ Company information extraction completed');
      } else {
        const error = await companyExtractionResponse.json();
        results.steps.push({
          step: 'company_extraction',
          status: 'error',
          message: error.error
        });
        console.warn('⚠️ Company extraction failed, continuing with other steps');
      }
    }

    // ステップ2: 課題抽出
    console.log('\nStep 2: Extracting challenges...');
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
    console.log('✅ Challenge extraction completed');

    // ステップ3: Snowflake DBマッチング
    console.log('\nStep 3: Performing Snowflake DB matching...');
    const snowflakeDBResponse = await fetch(`${req.nextUrl.origin}/api/snowflake/db-match`, {
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

    if (!snowflakeDBResponse.ok) {
      const error = await snowflakeDBResponse.json();
      throw new Error(`Snowflake DB matching failed: ${error.error}`);
    }

    const snowflakeDBResult = await snowflakeDBResponse.json();
    results.matching = snowflakeDBResult;
    results.steps.push({
      step: 'matching',
      status: 'success',
      method: 'snowflake_db',
      totalMatches: snowflakeDBResult.totalMatches,
      dataSource: snowflakeDBResult.dataSource
    });
    console.log('✅ Snowflake DB matching completed');

    // 結果を統合
    results.extractedChallenges = challengeResult.extractedChallenges;
    results.challengeAnalysis = challengeResult.challengeAnalysis;
    results.totalMatches = snowflakeDBResult.totalMatches;
    results.dataSource = snowflakeDBResult.dataSource;
    results.matchingMethod = 'snowflake-db';

    console.log('\n=== Snowflake DB Processing Complete ===');
    console.log(`Total matches found: ${snowflakeDBResult.totalMatches}`);
    console.log(`Processing completed successfully!`);

    return NextResponse.json({
      success: true,
      ...results
    });

  } catch (error: unknown) {
    console.error('Snowflake DB process error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Snowflake DB process failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
