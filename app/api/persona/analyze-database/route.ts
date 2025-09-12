import { NextRequest, NextResponse } from 'next/server';
import { getAllPersonas, searchPersonasAdvanced } from '@/lib/snowflake-persona';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { extractedPersonas, companyName } = await req.json();

    if (!extractedPersonas || !companyName) {
      return NextResponse.json(
        { error: 'Extracted personas and company name are required' },
        { status: 400 }
      );
    }

    console.log('=== データベースAI分析開始 ===');
    console.log(`企業名: ${companyName}`);
    console.log('抽出されたペルソナ:', JSON.stringify(extractedPersonas, null, 2));

    // 事前設定されたbusiness_tagマッピングを使用して効率的に検索
    const relevantBusinessTags = getRelevantBusinessTags(extractedPersonas);
    console.log('関連するbusiness_tag:', relevantBusinessTags);

    // 関連するbusiness_tagのみでデータを取得（効率化）
    const allPersonas = await getPersonasByBusinessTags(relevantBusinessTags, 2000);
    console.log(`関連データベースから取得したデータ: ${allPersonas.length}件`);

    if (allPersonas.length === 0) {
      return NextResponse.json({
        success: false,
        error: '関連するデータベースデータが見つかりませんでした'
      });
    }

    // データベースの統計情報を生成
    const dbStats = generateDatabaseStats(allPersonas);
    console.log('データベース統計情報:', dbStats);

    // AIにデータベース分析を依頼
    const aiAnalysis = await analyzeDatabaseWithAI(extractedPersonas, allPersonas, dbStats, companyName);
    console.log('AI分析結果:', aiAnalysis);

    return NextResponse.json({
      success: true,
      results: {
        companyName,
        extractedPersonas,
        databaseStats: dbStats,
        aiAnalysis: aiAnalysis,
        totalDatabaseRecords: allPersonas.length
      },
      message: 'データベースAI分析が完了しました'
    });

  } catch (error) {
    console.error('データベースAI分析エラー:', error);
    return NextResponse.json(
      { 
        error: `データベースAI分析失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false
      },
      { status: 500 }
    );
  }
}

/**
 * データベースの統計情報を生成
 */
function generateDatabaseStats(allPersonas: any[]): any {
  const businessTags = [...new Set(allPersonas.map(p => p.BUSINESS_TAG).filter(Boolean))];
  const departments = [...new Set(allPersonas.map(p => p.DEPARTMENT).filter(Boolean))];
  const sizeBands = [...new Set(allPersonas.map(p => p.SIZE_BAND).filter(Boolean))];
  const challenges = [...new Set(allPersonas.map(p => p.CHALLENGE_NAME).filter(Boolean))];
  const symptoms = [...new Set(allPersonas.map(p => p.SYMPTOM).filter(Boolean))];

  // 各カテゴリの分布
  const businessTagDistribution: Record<string, number> = {};
  const departmentDistribution: Record<string, number> = {};
  const sizeBandDistribution: Record<string, number> = {};
  const challengeDistribution: Record<string, number> = {};

  allPersonas.forEach(persona => {
    if (persona.BUSINESS_TAG) {
      businessTagDistribution[persona.BUSINESS_TAG] = (businessTagDistribution[persona.BUSINESS_TAG] || 0) + 1;
    }
    if (persona.DEPARTMENT) {
      departmentDistribution[persona.DEPARTMENT] = (departmentDistribution[persona.DEPARTMENT] || 0) + 1;
    }
    if (persona.SIZE_BAND) {
      sizeBandDistribution[persona.SIZE_BAND] = (sizeBandDistribution[persona.SIZE_BAND] || 0) + 1;
    }
    if (persona.CHALLENGE_NAME) {
      challengeDistribution[persona.CHALLENGE_NAME] = (challengeDistribution[persona.CHALLENGE_NAME] || 0) + 1;
    }
  });

  return {
    totalRecords: allPersonas.length,
    uniqueBusinessTags: businessTags.length,
    uniqueDepartments: departments.length,
    uniqueSizeBands: sizeBands.length,
    uniqueChallenges: challenges.length,
    uniqueSymptoms: symptoms.length,
    businessTags: businessTags.sort(),
    departments: departments.sort(),
    sizeBands: sizeBands.sort(),
    challenges: challenges.sort(),
    businessTagDistribution,
    departmentDistribution,
    sizeBandDistribution,
    challengeDistribution
  };
}

/**
 * AIを使ってデータベースを分析し、アプローチ先を抽出
 */
async function analyzeDatabaseWithAI(extractedPersonas: any, allPersonas: any[], dbStats: any, companyName: string): Promise<any> {
  try {
    // データベースのサンプルデータを準備（AIのコンテキスト制限を考慮）
    const sampleData = allPersonas.slice(0, 1000); // 最初の1000件をサンプルとして使用
    
    const prompt = `
あなたは営業戦略の専門家です。以下の情報を基に、データベースの中からアプローチ先として可能性のあるものを抽出してください。

## 企業情報
企業名: ${companyName}

## 抽出されたペルソナ（企業の強み・特徴）
${JSON.stringify(extractedPersonas, null, 2)}

## データベース統計情報
- 総レコード数: ${dbStats.totalRecords}件
- 業種・商材種類: ${dbStats.uniqueBusinessTags}種類
- 部署種類: ${dbStats.uniqueDepartments}種類
- 規模帯種類: ${dbStats.uniqueSizeBands}種類
- 課題種類: ${dbStats.uniqueChallenges}種類

## データベースの主要業種・商材（上位10位）
${Object.entries(dbStats.businessTagDistribution)
  .sort(([,a], [,b]) => (b as number) - (a as number))
  .slice(0, 10)
  .map(([tag, count]) => `- ${tag}: ${count}件`)
  .join('\n')}

## データベースの主要部署（上位10位）
${Object.entries(dbStats.departmentDistribution)
  .sort(([,a], [,b]) => (b as number) - (a as number))
  .slice(0, 10)
  .map(([dept, count]) => `- ${dept}: ${count}件`)
  .join('\n')}

## データベースの主要課題（上位10位）
${Object.entries(dbStats.challengeDistribution)
  .sort(([,a], [,b]) => (b as number) - (a as number))
  .slice(0, 10)
  .map(([challenge, count]) => `- ${challenge}: ${count}件`)
  .join('\n')}

## データベースサンプルデータ（最初の1000件）
${JSON.stringify(sampleData, null, 2)}

## 指示
上記のデータベース情報のみを使用して、企業のペルソナ（強み・特徴）に基づいて、アプローチ先として可能性のあるものを抽出してください。

以下の形式で回答してください：

{
  "potentialTargets": [
    {
      "category": "カテゴリ名",
      "businessTag": "データベースのBUSINESS_TAG",
      "department": "データベースのDEPARTMENT", 
      "sizeBand": "データベースのSIZE_BAND",
      "challengeName": "データベースのCHALLENGE_NAME",
      "symptom": "データベースのSYMPTOM",
      "reasoning": "なぜこのターゲットが適切かの理由",
      "matchScore": 0.0-1.0,
      "databaseRecord": "該当するデータベースレコードの詳細"
    }
  ],
  "analysis": {
    "totalMatches": 0,
    "topCategories": ["カテゴリ1", "カテゴリ2"],
    "recommendedApproach": "推奨アプローチ方法",
    "confidence": 0.0-1.0
  }
}

重要：
- データベースに存在する情報のみを使用してください
- 推測や外部知識は使用しないでください
- 企業のペルソナとデータベースの課題・症状の関連性を重視してください
- 具体的なデータベースレコードを参照してください
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'あなたは営業戦略の専門家です。データベースの情報のみを使用して、企業のペルソナに基づいてアプローチ先を抽出してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    const aiResponse = response.choices[0]?.message?.content || '';
    console.log('AI生レスポンス:', aiResponse);

    // JSONレスポンスをパース
    let aiAnalysis;
    try {
      // マークダウンコードブロックを除去
      const cleanedResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiAnalysis = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('AIレスポンスのパースエラー:', parseError);
      // パースに失敗した場合は、基本的な分析結果を返す
      aiAnalysis = {
        potentialTargets: [],
        analysis: {
          totalMatches: 0,
          topCategories: [],
          recommendedApproach: 'データベース分析に失敗しました',
          confidence: 0.0
        },
        error: 'AIレスポンスの解析に失敗しました'
      };
    }

    return aiAnalysis;

  } catch (error) {
    console.error('AI分析エラー:', error);
    return {
      potentialTargets: [],
      analysis: {
        totalMatches: 0,
        topCategories: [],
        recommendedApproach: 'AI分析に失敗しました',
        confidence: 0.0
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * 抽出されたペルソナから関連するbusiness_tagを取得
 */
function getRelevantBusinessTags(extractedPersonas: any): string[] {
  const industry = extractedPersonas.targets?.[0]?.industry_normalized || '';
  const personas = extractedPersonas.targets?.[0]?.personas || [];
  
  // 業種ベースのマッピング（実際のデータベースに基づく）
  const industryMapping: Record<string, string[]> = {
    '支援機関': ['介護施設運営', '障害者支援施設運営', '社会福祉法人運営', '福祉システム開発'],
    '製造業': ['3Dプリンター製造', 'AV機器製造', 'DVDレコーダー製造', '自動車部品製造'],
    'IT・システム開発': ['システム開発', 'ソフトウェア開発', 'Webアプリケーション開発', 'モバイルアプリ開発'],
    '小売業': ['3Dプリンター販売', 'AV機器販売', 'DVD販売', 'ECサイト運営'],
    '卸売業': ['3Dプリンター卸売', 'AV機器卸売', 'DVD卸売'],
    '建設業': ['エコ住宅建設', '福祉施設建設', '福祉施設設計'],
    '医療・福祉': ['クリニック(診療所)運営', '病院運営', '医療機器販売', '介護施設運営'],
    '教育': ['CADスクール運営', 'IT資格取得支援', '学習塾運営', '専門学校運営'],
    '金融': ['ETCカード発行', '介護保険販売', '医療保険販売', '不動産担保ローン販売'],
    '不動産': ['不動産任意売却', '不動産情報サイト運営', 'アパート賃貸', 'マンション賃貸'],
    '福祉': ['介護施設運営', '障害者支援施設運営', '福祉システム開発', '福祉人材派遣'],
    '介護': ['介護施設運営', '介護サービス計画(ケアプラン)作成', '介護人材派遣', '介護用品販売'],
    '障害者支援': ['障害者支援施設運営', '障害者就労支援', '障害者雇用支援', '介護施設運営'],
    '社会福祉': ['社会福祉法人運営', '介護施設運営', '福祉システム開発']
  };
  
  let relevantTags = industryMapping[industry] || ['その他'];
  
  // ペルソナの内容から追加のタグを推論
  for (const persona of personas) {
    const personaText = persona.persona_mapped || persona.persona_statement_raw || '';
    
    if (personaText.includes('障害者') || personaText.includes('入居拒否') || personaText.includes('住居')) {
      relevantTags = relevantTags.concat(['介護施設運営', '障害者支援施設運営', '社会福祉法人運営']);
    }
    if (personaText.includes('可視化') || personaText.includes('情報') || personaText.includes('システム')) {
      relevantTags = relevantTags.concat(['システム開発', 'ソフトウェア開発', 'Webアプリケーション開発']);
    }
    if (personaText.includes('物件') || personaText.includes('不動産')) {
      relevantTags = relevantTags.concat(['不動産任意売却', '不動産情報サイト運営', 'アパート賃貸', 'マンション賃貸']);
    }
  }
  
  // 重複を除去
  return [...new Set(relevantTags)];
}

/**
 * 指定されたbusiness_tagでデータを取得
 */
async function getPersonasByBusinessTags(businessTags: string[], limit: number): Promise<any[]> {
  try {
    let allResults: any[] = [];
    
    for (const businessTag of businessTags) {
      const results = await searchPersonasAdvanced({
        businessTag: businessTag,
        limit: Math.ceil(limit / businessTags.length) // 各タグに均等に配分
      });
      allResults = allResults.concat(results);
    }
    
    return allResults;
  } catch (error) {
    console.error('business_tag検索エラー:', error);
    return [];
  }
}
