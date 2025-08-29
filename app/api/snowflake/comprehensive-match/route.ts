import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

// 直接呼び出し可能な総合マッチング関数をエクスポート
export async function comprehensiveMatchChallenges(challenges: string[]) {
  try {
    if (!challenges || !Array.isArray(challenges) || challenges.length === 0) {
      throw new Error('Challenges array is required');
    }

    console.log('=== Snowflake 総合課題マッチング開始 ===');
    console.log(`処理対象課題数: ${challenges.length}`);
    challenges.forEach((challenge, index) => {
      console.log(`課題${index + 1}: ${challenge}`);
    });

    // 各課題のキーワードを抽出
    const allChallengeKeywords = challenges.flatMap(challenge => 
      challenge.split(/[、。・\s]+/).filter(keyword => keyword.length > 1)
    );
    const uniqueKeywords = [...new Set(allChallengeKeywords)];
    console.log(`抽出された総合キーワード: ${uniqueKeywords.slice(0, 10).join(', ')}...`);

    // 全課題を結合した文字列（将来的な使用のため保持）
    const combinedChallenges = challenges.join(' ');
    // const escapedCombinedChallenges = combinedChallenges.replace(/'/g, "''");

    // 総合マッチングクエリ
    const comprehensiveMatchingQuery = `
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
        WHERE COMPANY_NAME IS NOT NULL
          AND BUSINESS_DESCRIPTION IS NOT NULL
          AND BUSINESS_DESCRIPTION != ''
      ),
      comprehensive_matching AS (
        SELECT 
          sc.*,
          -- 複数課題への対応度を総合的に計算
          (
            -- 課題1: 案件獲得・営業関連
            CASE 
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%案件%') 
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%営業%')
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%直接%')
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%代理店%') THEN 0.3
              ELSE 0.0
            END +
            -- 課題2: マーケティング戦略関連
            CASE 
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%マーケティング%') 
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%戦略%')
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%ブランド%')
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%集客%') THEN 0.3
              ELSE 0.0
            END +
            -- 課題3: SNS・成果測定関連
            CASE 
              WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%SNS%') 
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%成果%')
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%測定%')
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%ROI%')
                   OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%売上%') THEN 0.3
              ELSE 0.0
            END
          ) as multi_challenge_score,
          
          -- 業界適合度
          CASE 
            WHEN sc.INDUSTRY LIKE '%マーケティング%' 
                 OR sc.INDUSTRY LIKE '%コンサル%' 
                 OR sc.INDUSTRY LIKE '%デジタル%' 
                 OR sc.INDUSTRY LIKE '%エンターテインメント%' THEN 0.2
            ELSE 0.1
          END as industry_fit_score,
          
          -- 総合支援力（複数分野対応）
          CASE 
            WHEN (UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%営業%') OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%案件%'))
                 AND (UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%マーケティング%') OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%戦略%'))
                 AND (UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%SNS%') OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%デジタル%') OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%成果%')) 
                 THEN 0.4  -- 3分野すべてカバー
            WHEN (UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%営業%') OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%案件%'))
                 AND (UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%マーケティング%') OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%戦略%'))
                 THEN 0.3  -- 2分野カバー
            WHEN (UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%マーケティング%') OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%戦略%'))
                 AND (UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%SNS%') OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%デジタル%'))
                 THEN 0.3  -- マーケティング+デジタル
            WHEN UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%総合%') 
                 OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%一貫%')
                 OR UPPER(sc.BUSINESS_DESCRIPTION) LIKE UPPER('%支援%') THEN 0.2
            ELSE 0.1
          END as comprehensive_support_score,
          
          -- ソリューション提供力
          CASE 
            WHEN sc.BUSINESS_DESCRIPTION LIKE '%ソリューション%' 
                 OR sc.BUSINESS_DESCRIPTION LIKE '%解決%' 
                 OR sc.BUSINESS_DESCRIPTION LIKE '%改善%'
                 OR sc.BUSINESS_DESCRIPTION LIKE '%向上%' THEN 0.15
            ELSE 0.05
          END as solution_power_score
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
        multi_challenge_score,
        industry_fit_score,
        comprehensive_support_score,
        solution_power_score,
        -- 総合マッチングスコア
        (multi_challenge_score + industry_fit_score + comprehensive_support_score + solution_power_score) as total_comprehensive_score
      FROM comprehensive_matching
      WHERE multi_challenge_score > 0.2  -- 最低でも1つの課題領域に対応
      ORDER BY total_comprehensive_score DESC, multi_challenge_score DESC
      LIMIT 5
    `;

    console.log('総合マッチングクエリ実行中...');
    const results = await snowflakeClient.executeQuery(comprehensiveMatchingQuery);
    console.log(`検索結果: ${results.length}件の総合解決企業が見つかりました`);

    // 結果を整形
    const comprehensiveMatches = results.map((row: any, index: number) => ({
      rank: index + 1,
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
      total_score: row.TOTAL_COMPREHENSIVE_SCORE,
      detailed_scores: {
        multi_challenge_coverage: row.MULTI_CHALLENGE_SCORE,
        industry_fit: row.INDUSTRY_FIT_SCORE,
        comprehensive_support: row.COMPREHENSIVE_SUPPORT_SCORE,
        solution_power: row.SOLUTION_POWER_SCORE
      },
      // 対応可能な課題領域を判定
      coverage_areas: {
        sales_acquisition: (row.BUSINESS_DESCRIPTION.includes('案件') || row.BUSINESS_DESCRIPTION.includes('営業') || row.BUSINESS_DESCRIPTION.includes('直接') || row.BUSINESS_DESCRIPTION.includes('代理店')),
        marketing_strategy: (row.BUSINESS_DESCRIPTION.includes('マーケティング') || row.BUSINESS_DESCRIPTION.includes('戦略') || row.BUSINESS_DESCRIPTION.includes('ブランド')),
        digital_performance: (row.BUSINESS_DESCRIPTION.includes('SNS') || row.BUSINESS_DESCRIPTION.includes('成果') || row.BUSINESS_DESCRIPTION.includes('測定') || row.BUSINESS_DESCRIPTION.includes('ROI'))
      }
    }));

    console.log('\n=== 総合マッチング結果 ===');
    comprehensiveMatches.forEach((match, index) => {
      console.log(`${index + 1}位: ${match.company_name}`);
      console.log(`  総合スコア: ${match.total_score.toFixed(3)}`);
      console.log(`  対応領域: 営業${match.coverage_areas.sales_acquisition ? '○' : '×'} / マーケ${match.coverage_areas.marketing_strategy ? '○' : '×'} / デジタル${match.coverage_areas.digital_performance ? '○' : '×'}`);
    });

    return {
      success: true,
      inputChallenges: challenges,
      totalMatches: comprehensiveMatches.length,
      comprehensiveMatches,
      matchingCriteria: {
        multi_challenge_coverage: '複数課題への対応度',
        industry_fit: '業界適合度',
        comprehensive_support: '総合支援力',
        solution_power: 'ソリューション提供力'
      },
      dataSource: 'snowflake-comprehensive-matching',
      matchingMethod: 'multi-challenge-comprehensive-scoring'
    };

  } catch (error: unknown) {
    console.error('Snowflake 総合課題マッチングエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Snowflake 総合課題マッチング失敗: ${errorMessage}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { challenges } = await req.json();
    const result = await comprehensiveMatchChallenges(challenges);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('API総合課題マッチングエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
