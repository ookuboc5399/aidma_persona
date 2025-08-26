import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    console.log('=== Snowflake シンプルマッチングテスト開始 ===');
    
    const testData = {
      companyName: "古川電気工業株式会社",
      challengeKeywords: ["製造", "システム", "品質", "人材", "技術"]
    };

    console.log('テストデータ:', testData);

    // 既存の企業データを使用してマッチング
    const simpleMatchingQuery = `
      SELECT 
        COMPANY_ID,
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        REGION,
        PREFECTURE,
        -- キーワードマッチングスコア
        CASE 
          WHEN BUSINESS_DESCRIPTION LIKE '%製造%' THEN 0.8
          WHEN BUSINESS_DESCRIPTION LIKE '%システム%' THEN 0.7
          WHEN BUSINESS_DESCRIPTION LIKE '%品質%' THEN 0.7
          WHEN BUSINESS_DESCRIPTION LIKE '%人材%' THEN 0.6
          WHEN BUSINESS_DESCRIPTION LIKE '%技術%' THEN 0.6
          WHEN INDUSTRY LIKE '%製造%' THEN 0.5
          WHEN INDUSTRY LIKE '%IT%' THEN 0.4
          ELSE 0.2
        END as match_score
      FROM COMPANIES 
      WHERE COMPANY_NAME != '${testData.companyName.replace(/'/g, "''")}'
        AND COMPANY_NAME IS NOT NULL
        AND (BUSINESS_DESCRIPTION IS NOT NULL OR INDUSTRY IS NOT NULL)
        AND COMPANY_NAME != '社名'
      ORDER BY match_score DESC
      LIMIT 5
    `;

    console.log('シンプルマッチングクエリ実行中...');
    const results = await snowflakeClient.executeQuery(simpleMatchingQuery);
    console.log(`✅ シンプルマッチング完了: ${results.length}件の結果`);

    // 結果を整形
    const matches = results.map((row: any) => ({
      company_id: row.COMPANY_ID,
      company_name: row.COMPANY_NAME,
      industry: row.INDUSTRY || '未設定',
      business_description: row.BUSINESS_DESCRIPTION || '未設定',
      region: row.REGION || '未設定',
      prefecture: row.PREFECTURE || '未設定',
      match_score: row.MATCH_SCORE,
      match_reason: `キーワードマッチング: ${row.MATCH_SCORE}`,
      solution_details: `${row.COMPANY_NAME}は${row.INDUSTRY || '製造業'}の企業として、製造システムや品質管理の課題解決に貢献できる可能性があります。`,
      advantages: [
        '豊富な実績とノウハウ',
        '専門的な技術力',
        '業界での信頼性'
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
      console.log(`   事業内容: ${match.business_description.substring(0, 50)}...`);
    });

    return NextResponse.json({
      success: true,
      companyName: testData.companyName,
      matches,
      totalMatches: matches.length,
      dataSource: 'snowflake',
      matchingMethod: 'simple-keyword',
      testData: testData
    });

  } catch (error: unknown) {
    console.error('Snowflake シンプルマッチングテストエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Snowflake シンプルマッチングテスト失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
