import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    const { companyName, challengeKeywords } = await req.json();

    if (!companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    console.log('=== Snowflake Internal Matching Start ===');
    console.log(`Challenge Company: ${companyName}`);
    console.log(`Challenge Keywords: ${challengeKeywords?.join(', ') || 'None'}`);

    // 課題企業の課題を取得
    const challengeQuery = `
      SELECT 
        COMPANY_NAME,
        CHALLENGES,
        SOURCE_URL
      FROM COMPANIES 
      WHERE COMPANY_NAME = '${companyName.replace(/'/g, "''")}'
      ORDER BY PROCESSED_AT DESC 
      LIMIT 1
    `;

    const challengeResult = await snowflakeClient.executeQuery(challengeQuery);
    
    if (!challengeResult || challengeResult.length === 0) {
      return NextResponse.json(
        { error: 'Challenge company not found in Snowflake' },
        { status: 404 }
      );
    }

    const challengeCompany = challengeResult[0];
    console.log('Challenge Company Data:', challengeCompany);

    // 解決企業を検索（キーワードベース）
    let solutionQuery = `
      SELECT 
        COMPANY_ID,
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        STRENGTHS,
        BUSINESS_TAGS,
        ORIGINAL_TAGS,
        REGION,
        PREFECTURE,
        EMPLOYEE_COUNT,
        INCORPORATION_DATE,
        OFFICIAL_WEBSITE,
        CONSULTANT_NAME
      FROM COMPANIES
      WHERE COMPANY_NAME != '${companyName.replace(/'/g, "''")}'
        AND COMPANY_NAME IS NOT NULL
        AND BUSINESS_DESCRIPTION IS NOT NULL
    `;

    // キーワードがある場合は検索条件に追加
    if (challengeKeywords && challengeKeywords.length > 0) {
      const keywordConditions = challengeKeywords.map((keyword: string) => 
        `(BUSINESS_DESCRIPTION LIKE '%${keyword.replace(/'/g, "''")}%' OR 
          STRENGTHS LIKE '%${keyword.replace(/'/g, "''")}%' OR
          BUSINESS_TAGS LIKE '%${keyword.replace(/'/g, "''")}%' OR
          ORIGINAL_TAGS LIKE '%${keyword.replace(/'/g, "''")}%')`
      ).join(' OR ');
      
      solutionQuery += ` AND (${keywordConditions})`;
    }

    solutionQuery += ` ORDER BY EMPLOYEE_COUNT DESC LIMIT 3`;

    const solutionCompanies = await snowflakeClient.executeQuery(solutionQuery);
    
    console.log(`Found ${solutionCompanies.length} potential solution companies`);

    // マッチングスコアを計算
    const matches = solutionCompanies.map((company) => {
      let score = 0;
      const reasons: string[] = [];

      // 業界マッチング
      if (company.INDUSTRY && challengeKeywords?.some((keyword: string) => 
        company.INDUSTRY.toLowerCase().includes(keyword.toLowerCase())
      )) {
        score += 0.3;
        reasons.push('業界マッチング');
      }

      // 事業内容マッチング
      if (company.BUSINESS_DESCRIPTION && challengeKeywords?.some((keyword: string) => 
        company.BUSINESS_DESCRIPTION.toLowerCase().includes(keyword.toLowerCase())
      )) {
        score += 0.4;
        reasons.push('事業内容マッチング');
      }

      // 強みマッチング
      if (company.STRENGTHS && challengeKeywords?.some((keyword: string) => 
        company.STRENGTHS.toLowerCase().includes(keyword.toLowerCase())
      )) {
        score += 0.3;
        reasons.push('強みマッチング');
      }

      // 従業員数による調整
      if (company.EMPLOYEE_COUNT) {
        const employeeCount = parseInt(company.EMPLOYEE_COUNT);
        if (employeeCount > 1000) {
          score += 0.1;
          reasons.push('大企業（信頼性）');
        } else if (employeeCount > 100) {
          score += 0.05;
          reasons.push('中堅企業');
        }
      }

      return {
        company_id: company.COMPANY_ID,
        company_name: company.COMPANY_NAME,
        industry: company.INDUSTRY || '未設定',
        business_description: company.BUSINESS_DESCRIPTION || '',
        strengths: company.STRENGTHS || '[]',
        region: company.REGION || '未設定',
        prefecture: company.PREFECTURE || '未設定',
        employee_count: company.EMPLOYEE_COUNT || '未設定',
        consultant_name: company.CONSULTANT_NAME || '',
        match_score: Math.min(score, 1.0),
        match_reason: reasons.join(', '),
        solution_details: `この企業は${reasons.join('、')}の観点で課題解決に貢献できる可能性があります。`,
        advantages: [
          '豊富な実績とノウハウ',
          '技術力と専門性',
          '地域密着型のサービス'
        ],
        considerations: [
          '具体的な導入スケジュールの確認',
          'コストとROIの検討',
          'サポート体制の確認'
        ],
        implementation_timeline: '3-6ヶ月',
        estimated_cost: '月額30万円〜'
      };
    });

    // スコアでソート
    matches.sort((a, b) => b.match_score - a.match_score);

    // 上位5社に絞り込み
    const topMatches = matches.slice(0, 5);

    console.log(`Top ${topMatches.length} matches found`);
    topMatches.forEach((match, index) => {
      console.log(`${index + 1}. ${match.company_name} (Score: ${match.match_score})`);
    });

    return NextResponse.json({
      success: true,
      companyName,
      matches: topMatches,
      totalMatches: topMatches.length,
      dataSource: 'snowflake',
      matchingMethod: 'internal-keyword',
      challengeKeywords
    });

  } catch (error: unknown) {
    console.error('Snowflake internal matching error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to perform internal matching: ${errorMessage}` },
      { status: 500 }
    );
  }
}
