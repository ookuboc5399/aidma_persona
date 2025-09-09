import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl, extractedChallenges, challengeAnalysis } = await req.json();

    if (!companyName || !conversationData) {
      return NextResponse.json(
        { error: 'Company name and conversation data are required' },
        { status: 400 }
      );
    }

    console.log('=== Snowflake DB Matching Start ===');
    console.log(`Company: ${companyName}`);
    console.log(`Source URL: ${sourceUrl}`);
    console.log(`Conversation Data Length: ${conversationData.length} characters`);

    // 課題キーワードを抽出
    const challengeKeywords = challengeAnalysis?.challenges?.flatMap((c: any) => 
      [c.category, c.title, ...(c.keywords || [])]
    ) || [];

    console.log('Extracted Challenge Keywords:', challengeKeywords);

    // Snowflake内の企業データでマッチングクエリ
    const matchingQuery = `
      WITH challenge_data AS (
        SELECT 
          '${companyName.replace(/'/g, "''")}' as challenge_company,
          '${challengeKeywords.join(' ').replace(/'/g, "''")}' as challenge_keywords
      ),
      available_companies AS (
        SELECT 
          COMPANY_ID,
          COMPANY_NAME,
          INDUSTRY,
          BUSINESS_DESCRIPTION,

          REGION,
          PREFECTURE,

          EMPLOYEE_COUNT,
          INCORPORATION_DATE,
          OFFICIAL_WEBSITE
        FROM COMPANIES
        WHERE COMPANY_NAME IS NOT NULL 
          AND BUSINESS_DESCRIPTION IS NOT NULL
      ),
      matching_scores AS (
        SELECT 
          ac.*,
          cd.challenge_company,
          cd.challenge_keywords,
          -- キーワードマッチングスコア
          CASE 
            WHEN LOWER(ac.BUSINESS_DESCRIPTION) LIKE '%${challengeKeywords.join('%').toLowerCase()}%' THEN 0.8
            WHEN LOWER(ac.BUSINESS_DESCRIPTION) LIKE '%${challengeKeywords.join('%').toLowerCase()}%' THEN 0.7
            WHEN LOWER(ac.INDUSTRY) LIKE '%${challengeKeywords.join('%').toLowerCase()}%' THEN 0.6
            ELSE 0.2
          END as keyword_match_score,
          -- 業種マッチングスコア
          CASE 
            WHEN cd.challenge_keywords LIKE '%IT%' AND ac.INDUSTRY LIKE '%IT%' THEN 0.8
            WHEN cd.challenge_keywords LIKE '%人材%' AND ac.INDUSTRY LIKE '%人材%' THEN 0.8
            WHEN cd.challenge_keywords LIKE '%マーケティング%' AND ac.INDUSTRY LIKE '%マーケティング%' THEN 0.8
            WHEN cd.challenge_keywords LIKE '%営業%' AND ac.INDUSTRY LIKE '%営業%' THEN 0.8
            WHEN cd.challenge_keywords LIKE '%経営%' AND ac.INDUSTRY LIKE '%経営%' THEN 0.8
            ELSE 0.3
          END as industry_match_score,
          -- 企業規模適合性スコア
          CASE 
            WHEN ac.EMPLOYEE_COUNT BETWEEN 10 AND 1000 THEN 0.9
            WHEN ac.EMPLOYEE_COUNT BETWEEN 1000 AND 10000 THEN 0.7
            WHEN ac.EMPLOYEE_COUNT > 10000 THEN 0.5
            ELSE 0.3
          END as size_compatibility_score,
          -- 地域マッチングスコア
          CASE 
            WHEN ac.REGION IS NOT NULL AND ac.PREFECTURE IS NOT NULL THEN 0.6
            WHEN ac.REGION IS NOT NULL THEN 0.4
            ELSE 0.2
          END as region_match_score,
          -- 設立年数による信頼性スコア
          CASE 
            WHEN ac.INCORPORATION_DATE <= DATEADD(YEAR, -10, CURRENT_DATE()) THEN 0.9  -- 10年以上
            WHEN ac.INCORPORATION_DATE <= DATEADD(YEAR, -5, CURRENT_DATE()) THEN 0.7   -- 5-10年
            WHEN ac.INCORPORATION_DATE <= DATEADD(YEAR, -3, CURRENT_DATE()) THEN 0.5   -- 3-5年
            ELSE 0.3  -- 3年未満
          END as reliability_score
        FROM available_companies ac
        CROSS JOIN challenge_data cd
      )
      SELECT 
        COMPANY_ID,
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        
        REGION,
        PREFECTURE,
        
        EMPLOYEE_COUNT,
                  INCORPORATION_DATE,
        OFFICIAL_WEBSITE,
        keyword_match_score,
        industry_match_score,
        size_compatibility_score,
        region_match_score,
        reliability_score,
        -- 総合マッチングスコア
        (keyword_match_score * 0.35 + industry_match_score * 0.25 + size_compatibility_score * 0.2 + region_match_score * 0.1 + reliability_score * 0.1) as total_match_score
      FROM matching_scores
      WHERE total_match_score > 0.3
      ORDER BY total_match_score DESC
      LIMIT 3
    `;

    console.log('Executing Snowflake matching query...');
    const results = await snowflakeClient.executeQuery(matchingQuery);

    console.log(`Found ${results.length} matching companies`);

    // 結果を整形
    const matches = results.map((row: any) => ({
      company_id: row.COMPANY_ID,
      company_name: row.COMPANY_NAME,
      industry: row.INDUSTRY,
      business_description: row.BUSINESS_DESCRIPTION,

      region: row.REGION,
      prefecture: row.PREFECTURE,

      employee_count: row.EMPLOYEE_COUNT,
      incorporation_date: row.INCORPORATION_DATE,
      official_website: row.OFFICIAL_WEBSITE,
      match_score: row.TOTAL_MATCH_SCORE,
      keyword_match_score: row.KEYWORD_MATCH_SCORE,
      industry_match_score: row.INDUSTRY_MATCH_SCORE,
      size_compatibility_score: row.SIZE_COMPATIBILITY_SCORE,
      region_match_score: row.REGION_MATCH_SCORE,
      reliability_score: row.RELIABILITY_SCORE
    }));

    console.log('=== Top 5 Matching Companies ===');
    matches.slice(0, 5).forEach((match, index) => {
      console.log(`${index + 1}. ${match.company_name} (Score: ${match.match_score.toFixed(3)})`);
      console.log(`   Industry: ${match.industry}`);
      console.log(`   Region: ${match.region}, ${match.prefecture}`);
      console.log(`   Employee Count: ${match.employee_count}`);
      console.log(`   Incorporation Date: ${match.incorporation_date}`);
      console.log(`   Official Website: ${match.official_website}`);
      console.log(`   Business Description: ${match.business_description?.substring(0, 100)}...`);
      console.log('---');
    });

    console.log('=== Snowflake DB Matching Complete ===');

    return NextResponse.json({
      success: true,
      companyName,
      matches,
      totalMatches: matches.length,
      dataSource: 'snowflake-db',
      matchingMethod: 'keyword + industry + size + region',
      challengeKeywords,
      processingInfo: {
        conversationLength: conversationData.length,
        keywordsCount: challengeKeywords.length,
        companiesAnalyzed: results.length
      }
    });

  } catch (error: unknown) {
    console.error('Snowflake DB matching error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to perform DB matching in Snowflake: ${errorMessage}` },
      { status: 500 }
    );
  }
}
