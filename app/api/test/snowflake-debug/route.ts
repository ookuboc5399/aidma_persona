import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    console.log('=== Snowflake データベースデバッグ開始 ===');

    // 1. 全企業データの確認
    console.log('\n=== 1. 全企業データ ===');
    const allCompaniesQuery = `
      SELECT 
        COMPANY_ID,
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        REGION,
        PREFECTURE,
        PROCESSED_AT
      FROM COMPANIES 
      ORDER BY PROCESSED_AT DESC 
      LIMIT 10
    `;

    const allCompanies = await snowflakeClient.executeQuery(allCompaniesQuery);
    console.log(`全企業数: ${allCompanies.length}`);
    allCompanies.forEach((company, index) => {
      console.log(`${index + 1}. ${company.COMPANY_NAME} (${company.INDUSTRY}) - ${company.REGION}`);
    });

    // 2. 課題企業データの確認
    console.log('\n=== 2. 課題企業データ ===');
    const challengeCompanyQuery = `
      SELECT 
        COMPANY_NAME,
        CHALLENGES,
        PROCESSED_AT
      FROM COMPANIES 
      WHERE COMPANY_NAME = '古川電気工業株式会社'
      ORDER BY PROCESSED_AT DESC 
      LIMIT 1
    `;

    const challengeCompany = await snowflakeClient.executeQuery(challengeCompanyQuery);
    console.log(`課題企業データ: ${challengeCompany.length}件`);
    if (challengeCompany.length > 0) {
      console.log('課題データ:', JSON.stringify(challengeCompany[0], null, 2));
    }

    // 3. 解決企業データの確認
    console.log('\n=== 3. 解決企業データ ===');
    const solutionCompaniesQuery = `
      SELECT 
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        REGION,
        PREFECTURE
      FROM COMPANIES 
      WHERE COMPANY_NAME IN (
        'テクノソリューション株式会社',
        '人材開発コンサルティング株式会社',
        '品質管理システムズ株式会社'
      )
      ORDER BY PROCESSED_AT DESC
    `;

    const solutionCompanies = await snowflakeClient.executeQuery(solutionCompaniesQuery);
    console.log(`解決企業データ: ${solutionCompanies.length}件`);
    solutionCompanies.forEach((company, index) => {
      console.log(`${index + 1}. ${company.COMPANY_NAME} (${company.INDUSTRY}) - ${company.REGION}`);
      console.log(`   事業内容: ${company.BUSINESS_DESCRIPTION?.substring(0, 100)}...`);
    });

    // 4. マッチング条件のテスト
    console.log('\n=== 4. マッチング条件テスト ===');
    const matchingTestQuery = `
      SELECT 
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        CASE 
          WHEN BUSINESS_DESCRIPTION LIKE '%製造システム%' THEN 0.8
          WHEN BUSINESS_DESCRIPTION LIKE '%品質管理%' THEN 0.8
          WHEN BUSINESS_DESCRIPTION LIKE '%人材%' THEN 0.7
          WHEN BUSINESS_DESCRIPTION LIKE '%技術者%' THEN 0.7
          WHEN BUSINESS_DESCRIPTION LIKE '%システム更新%' THEN 0.8
          ELSE 0.3
        END as keyword_match_score
      FROM COMPANIES 
      WHERE COMPANY_NAME != '古川電気工業株式会社'
        AND COMPANY_NAME IS NOT NULL
        AND BUSINESS_DESCRIPTION IS NOT NULL
      ORDER BY keyword_match_score DESC
      LIMIT 5
    `;

    const matchingTest = await snowflakeClient.executeQuery(matchingTestQuery);
    console.log(`マッチングテスト結果: ${matchingTest.length}件`);
    matchingTest.forEach((result, index) => {
      console.log(`${index + 1}. ${result.COMPANY_NAME} (Score: ${result.KEYWORD_MATCH_SCORE})`);
      console.log(`   業種: ${result.INDUSTRY}`);
      console.log(`   事業内容: ${result.BUSINESS_DESCRIPTION?.substring(0, 100)}...`);
    });

    return NextResponse.json({
      success: true,
      summary: {
        totalCompanies: allCompanies.length,
        challengeCompany: challengeCompany.length,
        solutionCompanies: solutionCompanies.length,
        matchingTestResults: matchingTest.length
      },
      details: {
        allCompanies,
        challengeCompany,
        solutionCompanies,
        matchingTest
      }
    });

  } catch (error: unknown) {
    console.error('Snowflake デバッグエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Snowflake デバッグ失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
