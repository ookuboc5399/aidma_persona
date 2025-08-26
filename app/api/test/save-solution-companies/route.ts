import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    console.log('=== 解決企業データ保存テスト開始 ===');

    // 解決企業データの定義
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
      },
      {
        name: "製造システムエンジニアリング株式会社",
        industry: "製造業・エンジニアリング",
        description: "製造システムの設計・構築・保守を専門とする企業。老朽化システムの更新と新技術導入に強み。",
        strengths: '["製造システム設計", "システム更新", "技術導入"]',
        tags: '["製造業", "エンジニアリング", "システム設計"]',
        region: "中部",
        prefecture: "愛知県",
        employeeCount: "400"
      },
      {
        name: "デジタル変革コンサルティング株式会社",
        industry: "ITコンサルティング",
        description: "製造業のデジタル変革を支援するコンサルティング企業。DX推進と業務効率化に特化。",
        strengths: '["DXコンサルティング", "業務効率化", "デジタル変革"]',
        tags: '["IT", "コンサルティング", "DX"]',
        region: "関東",
        prefecture: "東京都",
        employeeCount: "150"
      }
    ];

    const savedCompanies = [];

    // 各解決企業をSnowflakeに保存
    for (const company of solutionCompanies) {
      const insertQuery = `
        INSERT INTO COMPANIES (
          COMPANY_NAME,
          INDUSTRY,
          BUSINESS_DESCRIPTION,
          REGION,
          PREFECTURE,
          EMPLOYEE_COUNT,
          SOURCE_URL,
          PROCESSED_AT
        ) VALUES (
          '${company.name.replace(/'/g, "''")}',
          '${company.industry.replace(/'/g, "''")}',
          '${company.description.replace(/'/g, "''")}',
          '${company.region}',
          '${company.prefecture}',
          '${company.employeeCount}',
          'https://docs.google.com/spreadsheets/d/test-solution',
          CURRENT_TIMESTAMP()
        )
      `;

      try {
        await snowflakeClient.executeQuery(insertQuery);
        console.log(`✅ 解決企業データを保存: ${company.name}`);
        savedCompanies.push({
          name: company.name,
          status: 'success'
        });
      } catch (error) {
        console.log(`⚠️ 解決企業データの保存でエラー: ${company.name}`, error);
        savedCompanies.push({
          name: company.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // 保存後の確認クエリ
    const verifyQuery = `
      SELECT 
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        REGION,
        PREFECTURE,
        EMPLOYEE_COUNT,
        PROCESSED_AT
      FROM COMPANIES 
      WHERE COMPANY_NAME IN (
        'テクノソリューション株式会社',
        '人材開発コンサルティング株式会社',
        '品質管理システムズ株式会社',
        '製造システムエンジニアリング株式会社',
        'デジタル変革コンサルティング株式会社'
      )
      ORDER BY PROCESSED_AT DESC
    `;

    const verifyResult = await snowflakeClient.executeQuery(verifyQuery);
    console.log(`\n✅ 保存確認: ${verifyResult.length}件の解決企業データが保存されました`);

    return NextResponse.json({
      success: true,
      message: '解決企業データの保存が完了しました',
      savedCompanies,
      verification: {
        totalSaved: verifyResult.length,
        companies: verifyResult
      }
    });

  } catch (error: unknown) {
    console.error('解決企業データ保存エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `解決企業データ保存失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
