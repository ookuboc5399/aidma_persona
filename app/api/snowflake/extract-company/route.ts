import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { snowflakeClient } from '../../../../lib/snowflake';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// テキストをチャンクに分割する関数
function splitTextIntoChunks(text: string, maxChunkSize: number = 50000): string[] {
  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const endIndex = Math.min(currentIndex + maxChunkSize, text.length);
    chunks.push(text.substring(currentIndex, endIndex));
    currentIndex = endIndex;
  }

  return chunks;
}

// 複数チャンクの企業情報を統合する関数
function mergeCompanyAnalyses(analyses: any[]): any {
  const allStrengths: any[] = [];
  const allBusinessTags: string[] = [];
  const allOriginalTags: string[] = [];
  const summaries: string[] = [];

  analyses.forEach(analysis => {
    if (analysis.strengths) {
      allStrengths.push(...analysis.strengths);
    }
    if (analysis.business_tags) {
      allBusinessTags.push(...analysis.business_tags);
    }
    if (analysis.original_tags) {
      allOriginalTags.push(...analysis.original_tags);
    }
    if (analysis.business_description) {
      summaries.push(analysis.business_description);
    }
  });

  // 重複を除去
  const uniqueBusinessTags = [...new Set(allBusinessTags)];
  const uniqueOriginalTags = [...new Set(allOriginalTags)];

  // 最初の分析結果をベースに統合
  const baseAnalysis = analyses[0] || {};
  
  return {
    company_name: baseAnalysis.company_name,
    industry: baseAnalysis.industry,
    business_description: summaries.join(' '),
    strengths: allStrengths,
    business_tags: uniqueBusinessTags,
    original_tags: uniqueOriginalTags,
    region: baseAnalysis.region,
    prefecture: baseAnalysis.prefecture
  };
}

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    console.log('=== Snowflake Company Information Extraction Start ===');
    console.log(`Company: ${companyName}`);
    console.log(`Source URL: ${sourceUrl}`);

    // ChatGPT-5を使用して企業情報を抽出
    const model = process.env.CHATGPT_MODEL || 'gpt-4o';
    console.log(`Using model: ${model} for company extraction`);

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `あなたは企業分析の専門家です。会話データから企業の詳細情報を抽出してください。

以下の情報を抽出してください：
- 企業名
- 業種
- 事業内容（BUSINESS_DESCRIPTION）
- 事業の強み（STRENGTHS）
- 事業タグ（BUSINESS_TAGS）
- オリジナルタグ（ORIGINAL_TAGS）
- 地域
- 都道府県

JSON形式で回答してください：
{
  "company_name": "企業名",
  "industry": "業種",
  "business_description": "事業内容の詳細説明",
  "strengths": [
    {
      "title": "強みのタイトル",
      "description": "強みの詳細説明",
      "category": "カテゴリ"
    }
  ],
  "business_tags": ["タグ1", "タグ2", "タグ3"],
  "original_tags": ["特徴1", "特徴2"],
  "region": "地域",
  "prefecture": "都道府県"
}`
        },
        {
          role: "user",
          content: `以下の会話データから企業情報を抽出してください：

企業名: ${companyName}
会話データ:
${conversationData}`
        }
      ],
      // gpt-5-miniモデルはtemperatureパラメータをサポートしていないため、条件分岐
      ...(model !== 'gpt-5-mini-2025-08-07' && { temperature: 0.3 }),
      ...(model === 'gpt-5-mini-2025-08-07' ? { max_completion_tokens: 2000 } : { max_tokens: 2000 }),
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Failed to extract company information');
    }

    let extractedData;
    try {
      extractedData = JSON.parse(content);
    } catch (error) {
      throw new Error('Failed to parse extracted company information');
    }

    const { company_info, strengths } = extractedData || {};
    
    if (!company_info) {
      console.error('Extracted data structure:', JSON.stringify(extractedData, null, 2));
      throw new Error('Failed to extract company information: company_info is undefined');
    }

    console.log('\n=== Extracted Company Information ===');
    console.log(`Company Name: ${company_info.company_name}`);
    console.log(`Industry: ${company_info.industry}`);
    console.log(`Business Description: ${company_info.business_description}`);
    console.log(`Region: ${company_info.region}`);
    console.log(`Prefecture: ${company_info.prefecture}`);
    console.log(`Business Tags: ${JSON.stringify(company_info.business_tags)}`);
    console.log(`Original Tags: ${JSON.stringify(company_info.original_tags)}`);

    console.log('\n=== Extracted Strengths ===');
    if (strengths && strengths.length > 0) {
      strengths.forEach((strength: any, index: number) => {
        console.log(`${index + 1}. ${strength.title} (${strength.category})`);
        console.log(`   Description: ${strength.description}`);
        console.log('---');
      });
    } else {
      console.log('No strengths extracted');
    }
    console.log('=== Company Information Extraction Complete ===\n');

    // SnowflakeのCOMPANIESテーブルに挿入
    const insertQuery = `
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
        PROCESSED_AT
      ) VALUES (
        '${company_info.company_name?.replace(/'/g, "''") || companyName.replace(/'/g, "''")}',
        '${company_info.industry?.replace(/'/g, "''") || ''}',
        '${company_info.business_description?.replace(/'/g, "''") || ''}',
        '${JSON.stringify(strengths || []).replace(/'/g, "''")}',
        '${JSON.stringify(company_info.business_tags || []).replace(/'/g, "''")}',
        '${JSON.stringify(company_info.original_tags || []).replace(/'/g, "''")}',
        '${company_info.region?.replace(/'/g, "''") || ''}',
        '${company_info.prefecture?.replace(/'/g, "''") || ''}',
        '${sourceUrl.replace(/'/g, "''")}',
        CURRENT_TIMESTAMP()
      )
    `;

    await snowflakeClient.executeQuery(insertQuery);

    return NextResponse.json({
      success: true,
      message: 'Company information extracted and stored in Snowflake successfully',
      company_info,
      strengths,
      model_used: model
    });

  } catch (error: unknown) {
    console.error('Snowflake company extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to extract company information: ${errorMessage}` },
      { status: 500 }
    );
  }
}
