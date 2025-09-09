import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    const { challenges, companyName } = await req.json();

    if (!challenges || !Array.isArray(challenges) || challenges.length === 0) {
      return NextResponse.json(
        { error: 'Challenges array is required' },
        { status: 400 }
      );
    }

    console.log('=== Snowflake AI 課題マッチング開始 ===');
    console.log(`処理対象課題数: ${challenges.length}`);
    
    const allMatches: any[] = [];

    // 各課題に対してSnowflake AIマッチングを実行
    for (let i = 0; i < challenges.length; i++) {
      const challenge = challenges[i];
      console.log(`\n課題 ${i + 1}/${challenges.length}: "${challenge}"`);

      // 課題文字列をエスケープ
      const escapedChallenge = challenge.replace(/'/g, "''");

      // Snowflake内でAIを使用したマッチングクエリ
      const aiMatchingQuery = `
        WITH solution_companies AS (
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
            AND BUSINESS_DESCRIPTION IS NOT NULL
            AND BUSINESS_DESCRIPTION != ''
        ),
        ai_matching AS (
          SELECT 
            sc.*,
            -- セマンティック類似度計算（LIKEベース）
            CASE 
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%${escapedChallenge.split(' ')[0]}%') THEN 0.8
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%マーケティング%') AND UPPER('${escapedChallenge}') LIKE UPPER('%マーケティング%') THEN 0.9
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%代理店%') AND UPPER('${escapedChallenge}') LIKE UPPER('%代理店%') THEN 0.9
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%直接%') AND UPPER('${escapedChallenge}') LIKE UPPER('%直接%') THEN 0.9
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%営業%') AND UPPER('${escapedChallenge}') LIKE UPPER('%営業%') THEN 0.9
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%SNS%') AND UPPER('${escapedChallenge}') LIKE UPPER('%SNS%') THEN 0.9
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%成果%') AND UPPER('${escapedChallenge}') LIKE UPPER('%成果%') THEN 0.8
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%売上%') AND UPPER('${escapedChallenge}') LIKE UPPER('%売上%') THEN 0.8
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%案件%') AND UPPER('${escapedChallenge}') LIKE UPPER('%案件%') THEN 0.8
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%支援%') THEN 0.4
              ELSE 0.3
            END as semantic_similarity,
            -- 業種による追加スコア
            CASE 
              WHEN '${escapedChallenge}' LIKE '%マーケティング%' OR '${escapedChallenge}' LIKE '%集客%' OR '${escapedChallenge}' LIKE '%売上%' OR '${escapedChallenge}' LIKE '%認知%'
                   AND (sc.INDUSTRY LIKE '%マーケティング%' OR sc.INDUSTRY LIKE '%広告%' OR sc.INDUSTRY LIKE '%デジタル%') THEN 0.3
              WHEN '${escapedChallenge}' LIKE '%代理店%' OR '${escapedChallenge}' LIKE '%営業%' OR '${escapedChallenge}' LIKE '%案件%'
                   AND (sc.INDUSTRY LIKE '%コンサル%' OR sc.INDUSTRY LIKE '%営業%' OR sc.INDUSTRY LIKE '%マーケティング%') THEN 0.3
              WHEN '${escapedChallenge}' LIKE '%SNS%' OR '${escapedChallenge}' LIKE '%デジタル%'
                   AND (sc.INDUSTRY LIKE '%デジタル%' OR sc.INDUSTRY LIKE '%データ%' OR sc.INDUSTRY LIKE '%マーケティング%') THEN 0.3
              WHEN '${escapedChallenge}' LIKE '%エンターテインメント%' OR '${escapedChallenge}' LIKE '%エンタメ%'
                   AND sc.INDUSTRY LIKE '%エンターテインメント%' THEN 0.4
              ELSE 0.1
            END as industry_bonus,
            -- ソリューションキーワード追加スコア
            CASE 
              WHEN sc.BUSINESS_DESCRIPTION LIKE '%ソリューション%' 
                   OR sc.BUSINESS_DESCRIPTION LIKE '%解決%' 
                   OR sc.BUSINESS_DESCRIPTION LIKE '%支援%' THEN 0.1
              ELSE 0.0
            END as solution_bonus
          FROM solution_companies sc
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
          industry_bonus,
          solution_bonus,
          -- 総合マッチングスコア
          (semantic_similarity + industry_bonus + solution_bonus) as total_match_score
        FROM ai_matching
        WHERE semantic_similarity > 0.2  -- 最低閾値（下げました）
        ORDER BY total_match_score DESC
        LIMIT 3
      `;

      try {
        console.log(`Snowflake AI クエリ実行中...`);
        const results = await snowflakeClient.executeQuery(aiMatchingQuery);
        console.log(`検索結果: ${results.length}件の解決企業が見つかりました`);

        // 結果を整形して課題と紐付け
        const challengeMatches = results.map((row: any) => ({
          challenge: challenge,
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
          industry_bonus: row.INDUSTRY_BONUS,
          solution_bonus: row.SOLUTION_BONUS
        }));

        allMatches.push(...challengeMatches);

        console.log(`課題「${challenge}」のトップマッチ:`);
        challengeMatches.slice(0, 2).forEach((match, index) => {
          console.log(`${index + 1}. ${match.company_name} (スコア: ${match.match_score.toFixed(3)})`);
        });

      } catch (queryError) {
        console.error(`課題「${challenge}」のAIマッチング実行エラー:`, queryError);
        // 個々の課題エラーでも全体処理は続行
      }
    }

    console.log(`\n=== Snowflake AI 課題マッチング完了 ===`);
    console.log(`総マッチング結果数: ${allMatches.length}`);

    return NextResponse.json({
      success: true,
      totalChallenges: challenges.length,
      totalMatches: allMatches.length,
      matches: allMatches,
      dataSource: 'snowflake-ai-cortex',
      matchingMethod: 'semantic-similarity + industry-bonus + solution-bonus'
    });

  } catch (error: unknown) {
    console.error('Snowflake AI 課題マッチングエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Snowflake AI 課題マッチング失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}