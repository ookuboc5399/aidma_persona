import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { snowflakeClient } from '../../../../lib/snowflake';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { companyName, challengeAnalysis } = await req.json();

    if (!companyName || !challengeAnalysis) {
      return NextResponse.json(
        { error: 'Company name and challenge analysis are required' },
        { status: 400 }
      );
    }

    console.log('=== Snowflake Internal Matching Start ===');
    console.log(`Company: ${companyName}`);

    // 1. 課題企業の情報を取得
    const challengeCompanyQuery = `
      SELECT 
        COMPANY_NAME,
        CHALLENGES,
        SOURCE_URL
      FROM COMPANIES 
      WHERE COMPANY_NAME = '${companyName.replace(/'/g, "''")}'
      ORDER BY PROCESSED_AT DESC 
      LIMIT 1
    `;

    const challengeCompanyResult = await snowflakeClient.executeQuery(challengeCompanyQuery);
    if (!challengeCompanyResult || challengeCompanyResult.length === 0) {
      return NextResponse.json({
        success: true,
        companyName,
        matches: [],
        totalMatches: 0,
        message: 'Challenge company not found in Snowflake'
      });
    }

    const challengeCompany = challengeCompanyResult[0];

    // 2. 解決企業候補を取得（データサイズを制限）
    const solutionCompaniesQuery = `
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
        OFFICIAL_WEBSITE
      FROM COMPANIES
      WHERE COMPANY_NAME != '${companyName.replace(/'/g, "''")}'
        AND COMPANY_NAME IS NOT NULL
        AND BUSINESS_DESCRIPTION IS NOT NULL
      ORDER BY EMPLOYEE_COUNT DESC
      LIMIT 5
    `;

    const solutionCompanies = await snowflakeClient.executeQuery(solutionCompaniesQuery);

    if (solutionCompanies.length === 0) {
      return NextResponse.json({
        success: true,
        companyName,
        matches: [],
        totalMatches: 0,
        message: 'No solution companies found in Snowflake'
      });
    }

    console.log(`Found ${solutionCompanies.length} solution companies`);

    // デバッグ: 課題分析データの確認
    console.log('Challenge Analysis Data:', {
      companyName: challengeCompany.COMPANY_NAME,
      challengesCount: challengeAnalysis?.challenges?.length || 0,
      summary: challengeAnalysis?.summary?.substring(0, 100) + '...'
    });

    // 課題分析データが空またはエラーの場合の処理
    if (!challengeAnalysis || !challengeAnalysis.challenges || challengeAnalysis.challenges.length === 0) {
      console.warn('No valid challenge analysis found, using fallback data');
      const fallbackChallengeAnalysis = {
        challenges: [
          {
            title: '一般的な企業課題',
            category: '経営',
            description: '企業の成長と発展に関する課題',
            urgency: '中',
            keywords: ['経営', '成長', '発展']
          }
        ],
        summary: '課題抽出に失敗したため、一般的な企業課題として処理します。'
      };
      
      return NextResponse.json({
        success: true,
        companyName,
        matches: [],
        totalMatches: 0,
        dataSource: 'snowflake',
        matchingMethod: 'fallback',
        message: 'No valid challenges found, using fallback data'
      });
    }

    // 3. ChatGPTを使ってマッチング分析
    const model = process.env.CHATGPT_MODEL || 'gpt-4o';
    console.log(`Using model: ${model} for matching analysis`);

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `あなたは企業課題解決のマッチング専門家です。課題企業の課題と解決企業の強みを分析して、最適なマッチングを行ってください。

マッチングの基準：
1. 課題の解決可能性（技術・ノウハウの適合性）
2. 企業の実績・信頼性
3. 業界・地域の適合性
4. 実装の実現可能性

以下の形式で回答してください：
{
  "matches": [
    {
      "company_id": "企業ID",
      "company_name": "企業名",
      "match_score": 0.85,
      "match_reason": "課題と企業の強みがどのようにマッチするかの具体的な理由",
      "solution_details": "この企業が提供できる具体的な解決方法・サービス",
      "advantages": ["メリット1", "メリット2"],
      "considerations": ["検討事項1", "検討事項2"],
      "implementation_timeline": "実装予想期間（例：3-6ヶ月）",
      "estimated_cost": "概算コスト（例：月額50万円〜）"
    }
  ]
}

上位3社程度に絞って回答してください。必ずJSON形式で回答してください。match_scoreは0.0〜1.0の範囲で設定してください。`
        },
        {
          role: "user",
          content: `
課題企業: ${challengeCompany.COMPANY_NAME}
課題詳細:
${JSON.stringify(challengeAnalysis, null, 2)}

Snowflakeから取得した解決企業候補 (${solutionCompanies.length}社):
${solutionCompanies.map(company => 
  `ID: ${company.COMPANY_ID}
企業名: ${company.COMPANY_NAME}
業種: ${company.INDUSTRY || '未設定'}
事業内容: ${(company.BUSINESS_DESCRIPTION || '').substring(0, 200)}...
強み: ${JSON.stringify(company.STRENGTHS || []).substring(0, 100)}...
事業タグ: ${JSON.stringify(company.BUSINESS_TAGS || []).substring(0, 100)}...
地域: ${company.REGION || '未設定'}
従業員数: ${company.EMPLOYEE_COUNT || '未設定'}
---`
).join('\n')}
`
        }
      ],
      ...(model !== 'gpt-5-mini-2025-08-07' && { temperature: 0.3 }),
                        ...(model === 'gpt-5-mini-2025-08-07' ? { max_completion_tokens: 1000 } : { max_tokens: 1000 }),
    });

    const matchingContent = completion.choices[0]?.message?.content;
    console.log('ChatGPT Response:', {
      model: model,
      usage: completion.usage,
      contentLength: matchingContent?.length || 0,
      hasContent: !!matchingContent
    });
    
    if (!matchingContent) {
      console.error('ChatGPT returned empty content');
      console.error('Full completion object:', JSON.stringify(completion, null, 2));
      throw new Error('Failed to generate matching analysis');
    }

    let matchingAnalysis;
    try {
      matchingAnalysis = JSON.parse(matchingContent);
    } catch (error) {
      throw new Error('Failed to parse matching analysis response');
    }

    // 4. マッチング結果を整形
    const matches = matchingAnalysis.matches?.map((match: any) => {
      const snowflakeCompany = solutionCompanies.find(c => c.COMPANY_ID === match.company_id);
      return {
        ...match,
        snowflake_company: snowflakeCompany
      };
    }) || [];

    console.log(`✅ Matching completed. Found ${matches.length} matches`);

    return NextResponse.json({
      success: true,
      companyName,
      matches,
      totalMatches: matches.length,
      dataSource: 'snowflake',
      matchingMethod: 'chatgpt-internal'
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
