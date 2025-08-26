import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { snowflakeClient } from '../../../../lib/snowflake';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl, extractCompanyInfo = true } = await req.json();

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

    // ステップ3: Supabase企業データを取得
    console.log('Step 3: Fetching Supabase companies...');
    const { data: supabaseCompanies, error: supabaseError } = await supabase
      .from('companies')
      .select('*');

    if (supabaseError) {
      throw new Error(`Failed to fetch Supabase companies: ${supabaseError.message}`);
    }

    // ステップ4: Snowflake AIでマッチング（Supabase企業データを使用）
    console.log('Step 4: Performing Snowflake AI matching with Supabase data...');
    
    // 課題キーワードを抽出
    const challengeKeywords = challengeResult.challengeAnalysis?.challenges?.flatMap((c: any) => 
      [c.category, c.title, ...(c.keywords || [])]
    ) || [];

    // Snowflake AIマッチングクエリ（Supabase企業データを使用）
    const aiMatchingQuery = `
      WITH challenge_data AS (
        SELECT 
          '${companyName.replace(/'/g, "''")}' as challenge_company,
          '${challengeKeywords.join(' ').replace(/'/g, "''")}' as challenge_keywords
      ),
      supabase_companies AS (
        SELECT 
          id as company_id,
          company_name,
          industry,
          business_tags,
          original_tags,
          region,
          prefecture,
          business_description,
          challenges,
          strengths
        FROM (
          VALUES 
          ${supabaseCompanies.map(company => 
            `('${company.id}', '${company.company_name?.replace(/'/g, "''") || ''}', '${company.industry?.replace(/'/g, "''") || ''}', '${JSON.stringify(company.business_tags || []).replace(/'/g, "''")}', '${JSON.stringify(company.original_tags || []).replace(/'/g, "''")}', '${company.region?.replace(/'/g, "''") || ''}', '${company.prefecture?.replace(/'/g, "''") || ''}', '${company.business_description?.replace(/'/g, "''") || ''}', '${JSON.stringify(company.challenges || []).replace(/'/g, "''")}', '${JSON.stringify(company.strengths || []).replace(/'/g, "''")}')`
          ).join(',\n          ')}
        ) AS t(company_id, company_name, industry, business_tags, original_tags, region, prefecture, business_description, challenges, strengths)
      ),
      ai_matching AS (
        SELECT 
          sc.*,
          cd.challenge_company,
          cd.challenge_keywords,
          -- Snowflake AI機能を使用したマッチングスコア計算
          SNOWFLAKE.CORTEX_USER.SCORE(
            'sentence-transformers/all-MiniLM-L6-v2',
            cd.challenge_keywords,
            sc.industry || ' ' || sc.business_tags || ' ' || sc.original_tags || ' ' || sc.business_description
          ) as semantic_similarity,
          -- 業種マッチングスコア
          CASE 
            WHEN cd.challenge_keywords LIKE '%IT%' AND sc.industry LIKE '%IT%' THEN 0.8
            WHEN cd.challenge_keywords LIKE '%人材%' AND sc.industry LIKE '%人材%' THEN 0.8
            WHEN cd.challenge_keywords LIKE '%マーケティング%' AND sc.industry LIKE '%マーケティング%' THEN 0.8
            ELSE 0.3
          END as industry_match_score,
          -- タグマッチングスコア
          CASE 
            WHEN sc.business_tags IS NOT NULL AND sc.business_tags != '[]' THEN 0.7
            WHEN sc.original_tags IS NOT NULL AND sc.original_tags != '[]' THEN 0.6
            ELSE 0.3
          END as tag_match_score
        FROM supabase_companies sc
        CROSS JOIN challenge_data cd
      )
      SELECT 
        company_id,
        company_name,
        industry,
        business_tags,
        original_tags,
        region,
        prefecture,
        business_description,
        challenges,
        strengths,
        semantic_similarity,
        industry_match_score,
        tag_match_score,
        -- 総合マッチングスコア
        (semantic_similarity * 0.5 + industry_match_score * 0.3 + tag_match_score * 0.2) as total_match_score
      FROM ai_matching
      WHERE total_match_score > 0.4
      ORDER BY total_match_score DESC
      LIMIT 10
    `;

    const snowflakeResults = await snowflakeClient.executeQuery(aiMatchingQuery);

    // 結果を整形
    const matches = snowflakeResults.map((row: any) => ({
      company_id: row.COMPANY_ID,
      company_name: row.COMPANY_NAME,
      industry: row.INDUSTRY,
      business_tags: row.BUSINESS_TAGS,
      original_tags: row.ORIGINAL_TAGS,
      region: row.REGION,
      prefecture: row.PREFECTURE,
      business_description: row.BUSINESS_DESCRIPTION,
      challenges: row.CHALLENGES,
      strengths: row.STRENGTHS,
      match_score: row.TOTAL_MATCH_SCORE,
      semantic_similarity: row.SEMANTIC_SIMILARITY,
      industry_match_score: row.INDUSTRY_MATCH_SCORE,
      tag_match_score: row.TAG_MATCH_SCORE
    }));

    results.matching = {
      matches,
      totalMatches: matches.length,
      dataSource: 'supabase',
      matchingMethod: 'snowflake-ai'
    };

    results.steps.push({
      step: 'matching',
      status: 'success',
      method: 'supabase_snowflake_ai',
      totalMatches: matches.length,
      supabaseCompanies: supabaseCompanies.length
    });

    return NextResponse.json({
      success: true,
      ...results
    });

  } catch (error: unknown) {
    console.error('Supabase + Snowflake AI process error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Supabase + Snowflake AI process failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
