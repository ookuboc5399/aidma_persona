import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    console.log('=== サンプル課題解決企業の挿入開始 ===');

    // 課題解決企業のサンプルデータ
    const sampleCompanies = [
      {
        companyName: '株式会社AIソリューションズ',
        industry: 'IT・テクノロジー',
        businessDescription: 'AI・機械学習を活用した業務自動化ソリューション、データ分析サービス、チャットボット開発、RPA導入支援。人材不足やシステム効率化の課題を解決。',
        region: '関東',
        prefecture: '東京都',
        employeeCount: 150,
        officialWebsite: 'https://ai-solutions.example.com'
      },
      {
        companyName: '株式会社マーケティングプロ',
        industry: 'マーケティング・広告',
        businessDescription: 'デジタルマーケティング、SNS運用代行、SEO対策、ブランディング支援。集客や売上向上、顧客獲得の課題を解決する総合マーケティング会社。',
        region: '関東',
        prefecture: '東京都',
        employeeCount: 80,
        officialWebsite: 'https://marketing-pro.example.com'
      },
      {
        companyName: '株式会社人材エキスパート',
        industry: '人材・教育',
        businessDescription: '人材派遣、採用代行、社員研修、スキルアップ支援。人材不足、採用難、スキル不足の課題を解決。IT人材の育成・派遣に特化。',
        region: '関東',
        prefecture: '東京都',
        employeeCount: 200,
        officialWebsite: 'https://jinzai-expert.example.com'
      },
      {
        companyName: '株式会社システムイノベーション',
        industry: 'IT・システム開発',
        businessDescription: '基幹システム開発、クラウド移行支援、セキュリティ強化、ITインフラ構築。システム老朽化、セキュリティ、クラウド化の課題を解決。',
        region: '関東',
        prefecture: '東京都',
        employeeCount: 120,
        officialWebsite: 'https://system-innovation.example.com'
      },
      {
        companyName: '株式会社ビジネスコンサルティング',
        industry: 'コンサルティング',
        businessDescription: '経営戦略策定、業務効率化、組織改革、財務改善支援。経営課題、組織運営、業務プロセス改善の問題を解決する総合コンサルティング会社。',
        region: '関東',
        prefecture: '東京都',
        employeeCount: 95,
        officialWebsite: 'https://business-consulting.example.com'
      },
      {
        companyName: '株式会社製造ソリューション',
        industry: '製造・工業',
        businessDescription: '製造業向けIoT導入、品質管理システム、生産効率化支援、工場自動化。製造業の生産性向上、品質改善、コスト削減の課題を解決。',
        region: '中部',
        prefecture: '愛知県',
        employeeCount: 180,
        officialWebsite: 'https://manufacturing-solution.example.com'
      },
      {
        companyName: '株式会社セキュリティガード',
        industry: 'セキュリティ・IT',
        businessDescription: 'サイバーセキュリティ対策、情報漏洩防止、セキュリティ監査、従業員教育。企業のセキュリティリスク、データ保護の課題を解決。',
        region: '関東',
        prefecture: '東京都',
        employeeCount: 110,
        officialWebsite: 'https://security-guard.example.com'
      },
      {
        companyName: '株式会社営業サポート',
        industry: '営業支援・CRM',
        businessDescription: '営業代行、CRM導入支援、営業プロセス改善、顧客管理システム構築。営業効率化、売上向上、顧客管理の課題を解決。',
        region: '関西',
        prefecture: '大阪府',
        employeeCount: 75,
        officialWebsite: 'https://sales-support.example.com'
      }
    ];

    console.log(`挿入予定企業数: ${sampleCompanies.length}`);

    // 各企業を挿入
    const insertResults = [];
    for (const company of sampleCompanies) {
      try {
        // 安全な文字列エスケープ関数
        const escapeString = (str: string) => str.replace(/'/g, "''");
        
        // 重複チェック
        const checkQuery = `SELECT COUNT(*) as COUNT FROM COMPANIES WHERE COMPANY_NAME = '${escapeString(company.companyName)}'`;
        const checkResult = await snowflakeClient.executeQuery(checkQuery);
        
        if (checkResult[0]?.COUNT > 0) {
          console.log(`${company.companyName} は既に存在します（スキップ）`);
          insertResults.push({
            companyName: company.companyName,
            status: 'skipped',
            reason: '既に存在'
          });
          continue;
        }

        // 挿入クエリ
        const companyId = `SAMPLE_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const insertQuery = `
          INSERT INTO COMPANIES (
            COMPANY_ID,
            COMPANY_NAME,
            INDUSTRY,
            BUSINESS_DESCRIPTION,
            REGION,
            PREFECTURE,
            EMPLOYEE_COUNT,
            INCORPORATION_DATE,
            OFFICIAL_WEBSITE,
            UPDATED_AT,
            PROCESSED_AT
          ) VALUES (
            '${companyId}',
            '${escapeString(company.companyName)}',
            '${escapeString(company.industry)}',
            '${escapeString(company.businessDescription)}',
            '${escapeString(company.region)}',
            '${escapeString(company.prefecture)}',
            ${company.employeeCount},
            '2020-01-01',
            '${escapeString(company.officialWebsite)}',
            CURRENT_TIMESTAMP(),
            CURRENT_TIMESTAMP()
          )
        `;

        await snowflakeClient.executeQuery(insertQuery);
        console.log(`✅ ${company.companyName} を挿入しました`);
        
        insertResults.push({
          companyName: company.companyName,
          status: 'inserted',
          reason: '新規挿入'
        });

      } catch (error) {
        console.error(`❌ ${company.companyName} の挿入エラー:`, error);
        insertResults.push({
          companyName: company.companyName,
          status: 'error',
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // 挿入後の企業数を確認
    const countQuery = `SELECT COUNT(*) as TOTAL_COUNT FROM COMPANIES`;
    const countResult = await snowflakeClient.executeQuery(countQuery);
    const totalCount = countResult[0]?.TOTAL_COUNT || 0;

    console.log(`挿入完了。現在の総企業数: ${totalCount}`);

    return NextResponse.json({
      success: true,
      totalInserted: insertResults.filter(r => r.status === 'inserted').length,
      totalSkipped: insertResults.filter(r => r.status === 'skipped').length,
      totalErrors: insertResults.filter(r => r.status === 'error').length,
      totalCount,
      insertResults,
      message: 'サンプル課題解決企業の挿入が完了しました'
    });

  } catch (error: unknown) {
    console.error('サンプル企業挿入エラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `サンプル企業挿入失敗: ${errorMessage}` },
      { status: 500 }
    );
  }
}
