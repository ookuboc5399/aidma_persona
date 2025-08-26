import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    console.log('=== Snowflake AI マッチングテスト開始 ===');
    
    const testData = {
      companyName: "古川電気工業株式会社",
      challengeKeywords: ["製造システム", "品質管理", "人材不足", "技術者", "システム更新"]
    };

    console.log('テストデータ:', testData);

    // Step 1: テスト用の課題企業データをSnowflakeに保存
    console.log('\n=== Step 1: テストデータをSnowflakeに保存 ===');
    const insertChallengeQuery = `
      INSERT INTO COMPANIES (
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        STRENGTHS,
        BUSINESS_TAGS,
        ORIGINAL_TAGS,
        REGION,
        PREFECTURE,
        SOURCE_URL,
        CHALLENGES,
        PROCESSED_AT
      ) VALUES (
        '${testData.companyName.replace(/'/g, "''")}',
        '製造業',
        '電気機器の製造・販売を行う企業。製造システムの老朽化と人材不足が課題。',
        '["技術力", "品質管理", "地域密着"]',
        '["製造業", "電気機器", "技術開発"]',
        '["老舗企業", "地域貢献"]',
        '中部',
        '愛知県',
        'https://docs.google.com/spreadsheets/d/test',
        '[{"category":"技術・システムの課題","title":"製造システムの老朽化","description":"10年以上前の製造システムが新技術に対応できていない","urgency":"高","keywords":["製造システム","老朽化","技術対応"]},{"category":"人材・組織の課題","title":"技術者不足","description":"若手エンジニアの採用が困難で、既存技術者のスキルアップも必要","urgency":"高","keywords":["人材不足","技術者","スキルアップ"]}]',
        CURRENT_TIMESTAMP()
      )
    `;

    try {
      await snowflakeClient.executeQuery(insertChallengeQuery);
      console.log('✅ 課題企業データを保存しました');
    } catch (error) {
      console.log('⚠️ 課題企業データの保存でエラー（既に存在する可能性）:', error);
    }

    // Step 2: テスト用の解決企業データをSnowflakeに保存
    console.log('\n=== Step 2: 解決企業データをSnowflakeに保存 ===');
    const solutionCompanies = [
      {
        name: "テクノソリューション株式会社",
        industry: "IT・システム開発",
        description: "製造業向けのシステム開発・導入を専門とする企業。製造システムの更新と品質管理システムの導入実績多数。",
        strengths: '["製造システム開発", "品質管理システム", "技術コンサルティング"]',
        tags: '["IT", "製造業", "システム開発"]',
        region: "関東",
        prefecture: "東京都",
        employeeCount: "500"
      },
      {
        name: "人材開発コンサルティング株式会社",
        industry: "人材・教育",
        description: "製造業向けの人材育成・研修サービスを提供。技術者のスキルアッププログラムに特化。",
        strengths: '["技術者育成", "研修プログラム", "人材コンサルティング"]',
        tags: '["人材", "教育", "製造業"]',
        region: "関西",
        prefecture: "大阪府",
        employeeCount: "200"
      },
      {
        name: "品質管理システムズ株式会社",
        industry: "品質管理・検査",
        description: "製造業向けの品質管理システムと検査装置を開発・販売。不良品流出防止システムの専門企業。",
        strengths: '["品質管理システム", "検査装置", "不良品防止"]',
        tags: '["品質管理", "検査", "製造業"]',
        region: "中部",
        prefecture: "愛知県",
        employeeCount: "300"
      }
    ];

    for (const company of solutionCompanies) {
      const insertSolutionQuery = `
        INSERT INTO COMPANIES (
          COMPANY_NAME,
          INDUSTRY,
          BUSINESS_DESCRIPTION,
          STRENGTHS,
          BUSINESS_TAGS,
          ORIGINAL_TAGS,
          REGION,
          PREFECTURE,
          EMPLOYEE_COUNT,
          SOURCE_URL,
          PROCESSED_AT
        ) VALUES (
          '${company.name.replace(/'/g, "''")}',
          '${company.industry.replace(/'/g, "''")}',
          '${company.description.replace(/'/g, "''")}',
          '${company.strengths}',
          '${company.tags}',
          '["専門企業", "実績豊富"]',
          '${company.region}',
          '${company.prefecture}',
          '${company.employeeCount}',
          'https://docs.google.com/spreadsheets/d/test',
          CURRENT_TIMESTAMP()
        )
      `;

      try {
        await snowflakeClient.executeQuery(insertSolutionQuery);
        console.log(`✅ 解決企業データを保存: ${company.name}`);
      } catch (error) {
        console.log(`⚠️ 解決企業データの保存でエラー（既に存在する可能性）: ${company.name}`, error);
      }
    }

    // Step 3: Snowflake AI マッチングを実行
    console.log('\n=== Step 3: Snowflake AI マッチング実行 ===');
    const aiMatchingQuery = `
      WITH company_challenges AS (
        SELECT 
          COMPANY_NAME,
          CHALLENGES
        FROM COMPANIES
        WHERE COMPANY_NAME = '${testData.companyName.replace(/'/g, "''")}'
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
          STRENGTHS,
          OFFICIAL_WEBSITE
        FROM COMPANIES
        WHERE COMPANY_NAME != '${testData.companyName.replace(/'/g, "''")}'
          AND COMPANY_NAME IS NOT NULL
          AND BUSINESS_DESCRIPTION IS NOT NULL
      ),
      ai_matching AS (
        SELECT 
          sc.*,
          cc.COMPANY_NAME as challenge_company,
          cc.CHALLENGES,
          -- キーワードマッチングスコア
          CASE 
            WHEN sc.BUSINESS_DESCRIPTION LIKE '%製造システム%' THEN 0.8
            WHEN sc.BUSINESS_DESCRIPTION LIKE '%品質管理%' THEN 0.8
            WHEN sc.BUSINESS_DESCRIPTION LIKE '%人材%' THEN 0.7
            WHEN sc.BUSINESS_DESCRIPTION LIKE '%技術者%' THEN 0.7
            WHEN sc.BUSINESS_DESCRIPTION LIKE '%システム更新%' THEN 0.8
            ELSE 0.3
          END as keyword_match_score,
          -- 業種マッチングスコア
          CASE 
            WHEN cc.CHALLENGES::VARIANT:challenges[0]:category::STRING LIKE '%技術・システム%' 
                 AND sc.INDUSTRY LIKE '%IT%' THEN 0.8
            WHEN cc.CHALLENGES::VARIANT:challenges[0]:category::STRING LIKE '%人材・組織%' 
                 AND sc.INDUSTRY LIKE '%人材%' THEN 0.8
            WHEN cc.CHALLENGES::VARIANT:challenges[0]:category::STRING LIKE '%品質向上%' 
                 AND sc.INDUSTRY LIKE '%品質%' THEN 0.8
            ELSE 0.3
          END as industry_match_score,
          -- 地域マッチングスコア
          CASE 
            WHEN sc.REGION = '中部' THEN 0.2
            WHEN sc.PREFECTURE = '愛知県' THEN 0.3
            ELSE 0.1
          END as region_match_score
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
        STRENGTHS,
        OFFICIAL_WEBSITE,
        keyword_match_score,
        industry_match_score,
        region_match_score,
        -- 総合マッチングスコア
        (keyword_match_score * 0.5 + industry_match_score * 0.3 + region_match_score * 0.2) as total_match_score
      FROM ai_matching
      WHERE total_match_score > 0.1
      ORDER BY total_match_score DESC
      LIMIT 5
    `;

    console.log('AI マッチングクエリ実行中...');
    const results = await snowflakeClient.executeQuery(aiMatchingQuery);
    console.log(`✅ AI マッチング完了: ${results.length}件の結果`);

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
      strengths: row.STRENGTHS,
      official_website: row.OFFICIAL_WEBSITE,
      match_score: row.TOTAL_MATCH_SCORE,
      keyword_match_score: row.KEYWORD_MATCH_SCORE,
      industry_match_score: row.INDUSTRY_MATCH_SCORE,
      region_match_score: row.REGION_MATCH_SCORE,
      match_reason: `キーワード: ${row.KEYWORD_MATCH_SCORE}, 業種: ${row.INDUSTRY_MATCH_SCORE}, 地域: ${row.REGION_MATCH_SCORE}`,
      solution_details: `${row.COMPANY_NAME}は${row.INDUSTRY}の専門企業として、製造システム更新や品質管理、人材育成の課題解決に貢献できます。`,
      advantages: [
        '豊富な実績とノウハウ',
        '専門的な技術力',
        '地域密着型のサービス'
      ],
      considerations: [
        '具体的な導入スケジュールの確認',
        'コストとROIの検討',
        'サポート体制の確認'
      ],
      implementation_timeline: '3-6ヶ月',
      estimated_cost: '月額30万円〜'
    }));

    console.log('\n=== マッチング結果 ===');
    matches.forEach((match, index) => {
      console.log(`${index + 1}. ${match.company_name} (Score: ${match.match_score.toFixed(2)})`);
      console.log(`   業種: ${match.industry}`);
      console.log(`   理由: ${match.match_reason}`);
    });

    return NextResponse.json({
      success: true,
      companyName: testData.companyName,
      matches,
      totalMatches: matches.length,
      dataSource: 'snowflake',
      matchingMethod: 'ai-keyword-industry-region',
      testData: testData
    });

  } catch (error: unknown) {
    console.error('Snowflake AI マッチングテストエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Snowflake AI マッチングテスト失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
