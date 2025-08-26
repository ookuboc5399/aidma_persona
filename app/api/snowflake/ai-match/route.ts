import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationId } = await req.json();

    if (!companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    // Snowflake内でAIを使用したマッチングクエリ
    const aiMatchingQuery = `
      WITH                   company_challenges AS (
                    SELECT 
                      COMPANY_NAME,
                      SOURCE_URL,
                      CHALLENGES
                    FROM COMPANIES 
                    WHERE COMPANY_NAME = '${companyName.replace(/'/g, "''")}'
                    ORDER BY PROCESSED_AT DESC 
                    LIMIT 1
                  ),
      solution_companies AS (
        SELECT 
          COMPANY_ID,
          COMPANY_NAME,
          INDUSTRY,
          REGION,
          PREFECTURE,
          BUSINESS_TAGS,
          ORIGINAL_TAGS,
          BUSINESS_DESCRIPTION,
          CHALLENGES,
          STRENGTHS,
          OFFICIAL_WEBSITE
        FROM COMPANIES
        WHERE COMPANY_NAME IS NOT NULL  -- 有効な企業のみ
      ),
      ai_matching AS (
        SELECT 
          sc.*,
          cc.COMPANY_NAME as challenge_company,
          cc.CHALLENGES,
          -- Snowflake AI機能を使用したマッチングスコア計算
          SNOWFLAKE.CORTEX_USER.SCORE(
            'sentence-transformers/all-MiniLM-L6-v2',
            cc.CHALLENGES,
            sc.INDUSTRY || ' ' || sc.BUSINESS_TAGS || ' ' || sc.ORIGINAL_TAGS || ' ' || sc.BUSINESS_DESCRIPTION
          ) as semantic_similarity,
          -- 業種マッチングスコア
          CASE 
            WHEN cc.CHALLENGES::VARIANT:challenges[0]:category::STRING LIKE '%IT%' 
                 AND sc.INDUSTRY LIKE '%IT%' THEN 0.8
            WHEN cc.CHALLENGES::VARIANT:challenges[0]:category::STRING LIKE '%人材%' 
                 AND sc.INDUSTRY LIKE '%人材%' THEN 0.8
            WHEN cc.CHALLENGES::VARIANT:challenges[0]:category::STRING LIKE '%マーケティング%' 
                 AND sc.INDUSTRY LIKE '%マーケティング%' THEN 0.8
            ELSE 0.3
          END as industry_match_score,
          -- タグマッチングスコア
          CASE 
            WHEN sc.BUSINESS_TAGS IS NOT NULL AND sc.BUSINESS_TAGS != '[]' THEN 0.7
            WHEN sc.ORIGINAL_TAGS IS NOT NULL AND sc.ORIGINAL_TAGS != '[]' THEN 0.6
            ELSE 0.3
          END as tag_match_score
        FROM solution_companies sc
        CROSS JOIN company_challenges cc
      )
      SELECT 
        COMPANY_ID,
        COMPANY_NAME,
        INDUSTRY,
        REGION,
        PREFECTURE,
        BUSINESS_TAGS,
        ORIGINAL_TAGS,
        BUSINESS_DESCRIPTION,
        CHALLENGES,
        STRENGTHS,
        OFFICIAL_WEBSITE,
        semantic_similarity,
        industry_match_score,
        tag_match_score,
        -- 総合マッチングスコア
        (semantic_similarity * 0.5 + industry_match_score * 0.3 + tag_match_score * 0.2) as total_match_score
      FROM ai_matching
      WHERE total_match_score > 0.5
      ORDER BY total_match_score DESC
      LIMIT 10
    `;

    const results = await snowflakeClient.executeQuery(aiMatchingQuery);

    // 結果を整形
    const matches = results.map((row: any) => ({
      company_id: row.COMPANY_ID,
      company_name: row.COMPANY_NAME,
      industry: row.INDUSTRY,
      region: row.REGION,
      prefecture: row.PREFECTURE,
      business_tags: row.BUSINESS_TAGS,
      original_tags: row.ORIGINAL_TAGS,
      business_description: row.BUSINESS_DESCRIPTION,
      challenges: row.CHALLENGES,
      strengths: row.STRENGTHS,
      official_website: row.OFFICIAL_WEBSITE,
      match_score: row.TOTAL_MATCH_SCORE,
      semantic_similarity: row.SEMANTIC_SIMILARITY,
      industry_match_score: row.INDUSTRY_MATCH_SCORE,
      tag_match_score: row.TAG_MATCH_SCORE
    }));

    return NextResponse.json({
      success: true,
      companyName,
      matches,
      totalMatches: matches.length,
      dataSource: 'snowflake-ai',
      matchingMethod: 'semantic-similarity + industry + tags'
    });

  } catch (error: unknown) {
    console.error('Snowflake AI matching error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to perform AI matching in Snowflake: ${errorMessage}` },
      { status: 500 }
    );
  }
}
