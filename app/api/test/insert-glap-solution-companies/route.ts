import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    console.log('=== GLAPentertainment課題解決企業の挿入開始 ===');

    // GLAPentertainmentの課題を解決できる企業データ
    const solutionCompanies = [
      {
        companyName: '株式会社マーケティングプロ',
        industry: 'マーケティング・広告',
        businessDescription: '代理店に依存しない直接営業戦略の構築支援。BtoB企業向けのダイレクトマーケティング手法を提供し、案件化率の向上をサポート。',
        strengths: '営業プロセスの可視化、リード獲得から成約までの一貫した支援体制、実績豊富なコンサルタント陣',
        region: '関東',
        prefecture: '東京都',
        officialWebsite: 'https://marketing-pro.example.com',
        businessTags: null,
        originalTags: null
      },
      {
        companyName: '株式会社SNSマーケティングソリューションズ',
        industry: 'デジタルマーケティング',
        businessDescription: 'SNSマーケティングの成果測定と改善支援に特化。ROI向上のための戦略立案から運用改善まで一貫してサポート。',
        strengths: 'SNS運用の成果分析、コンバージョン率改善、エンゲージメント向上ノウハウ',
        region: '関東',
        prefecture: '東京都',
        officialWebsite: 'https://sns-marketing-solutions.example.com',
        businessTags: null,
        originalTags: null
      },
      {
        companyName: '株式会社営業変革コンサルティング',
        industry: 'コンサルティング',
        businessDescription: '代理店依存からの脱却支援。自社営業力強化と直接顧客獲得のための組織変革をサポート。営業プロセスの標準化と成果向上を実現。',
        strengths: '営業組織改革、直接営業ノウハウ、顧客開拓戦略立案',
        region: '関東',
        prefecture: '東京都',
        officialWebsite: 'https://sales-transformation.example.com',
        businessTags: null,
        originalTags: null
      },
      {
        companyName: '株式会社エンターテインメントマーケティング',
        industry: 'エンターテインメント・マーケティング',
        businessDescription: 'エンターテインメント業界専門のマーケティング支援。業界特有の課題を理解し、効果的な集客・認知拡大戦略を提供。',
        strengths: 'エンターテインメント業界特化、集客ノウハウ、ブランド認知向上',
        region: '関東',
        prefecture: '東京都',
        officialWebsite: 'https://entertainment-marketing.example.com',
        businessTags: null,
        originalTags: null
      },
      {
        companyName: '株式会社デジタル成果測定',
        industry: 'データ分析・マーケティング',
        businessDescription: 'デジタルマーケティングの成果測定と改善に特化。SNSやWeb施策のROI可視化と改善提案を通じて、具体的な売上向上をサポート。',
        strengths: 'マーケティング効果測定、データ分析、ROI改善提案',
        region: '関東',
        prefecture: '東京都',
        officialWebsite: 'https://digital-measurement.example.com',
        businessTags: null,
        originalTags: null
      },
      {
        companyName: '株式会社広告代理店脱却支援',
        industry: 'コンサルティング・マーケティング',
        businessDescription: '広告代理店依存からの脱却を専門とするコンサルティング。自社マーケティング力の構築と直接顧客との関係構築をサポート。',
        strengths: '代理店依存脱却ノウハウ、自社マーケティング構築、直接顧客開拓',
        region: '関東',
        prefecture: '東京都',
        officialWebsite: 'https://agency-independence.example.com',
        businessTags: null,
        originalTags: null
      }
    ];

    let successCount = 0;
    let errorCount = 0;
    const results = [];

    for (const company of solutionCompanies) {
      try {
        const companyId = uuidv4();
        
        // SQL文字列のエスケープ処理
        const escapedCompanyName = company.companyName.replace(/'/g, "''");
        const escapedBusinessDescription = company.businessDescription.replace(/'/g, "''");
        const escapedStrengths = company.strengths.replace(/'/g, "''");

        const insertQuery = `
          INSERT INTO COMPANIES (
            COMPANY_ID,
            COMPANY_NAME,
            INDUSTRY,
            BUSINESS_DESCRIPTION,
            STRENGTHS,
            REGION,
            PREFECTURE,
            OFFICIAL_WEBSITE,

            UPDATED_AT,
            PROCESSED_AT
          ) VALUES (
            '${companyId}',
            '${escapedCompanyName}',
            '${company.industry}',
            '${escapedBusinessDescription}',
            '${escapedStrengths}',
            '${company.region}',
            '${company.prefecture}',
            '${company.officialWebsite}',
            CURRENT_TIMESTAMP(),
            CURRENT_TIMESTAMP()
          )
        `;

        await snowflakeClient.executeQuery(insertQuery);
        
        console.log(`✅ ${company.companyName} を正常に挿入しました`);
        successCount++;
        
        results.push({
          companyName: company.companyName,
          status: 'success'
        });
        
      } catch (error) {
        console.error(`❌ ${company.companyName} の挿入エラー:`, error);
        errorCount++;
        
        results.push({
          companyName: company.companyName,
          status: 'error',
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log(`=== 挿入完了 ===`);
    console.log(`成功: ${successCount}件, エラー: ${errorCount}件`);

    return NextResponse.json({
      success: true,
      totalProcessed: solutionCompanies.length,
      successCount,
      errorCount,
      results,
      message: `GLAPentertainment課題解決企業の挿入が完了しました`,
      targetChallenges: [
        '日本経済広告社との打ち合わせが多いが、具体的な案件に繋がらない',
        '代理店経由での案件獲得が中心で、直接的なマーケティング戦略が不足している',
        'SNSを活用した売上拡大や認知拡大の支援を行っているが、具体的な成果に繋がっていない'
      ]
    });

  } catch (error: unknown) {
    console.error('GLAPentertainment課題解決企業挿入エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `GLAPentertainment課題解決企業の挿入に失敗しました: ${errorMessage}` },
      { status: 500 }
    );
  }
}
