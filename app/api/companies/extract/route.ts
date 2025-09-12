import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { companyName, conversationData, sourceUrl } = await req.json();

    if (!companyName || !conversationData || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name, conversation data, and source URL are required' },
        { status: 400 }
      );
    }

    // 既存企業チェック
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id, company_name')
      .eq('company_name', companyName)
      .single();

    if (existingCompany) {
      return NextResponse.json({
        success: false,
        message: 'Company already exists in database',
        companyId: existingCompany.id,
        companyName: existingCompany.company_name
      });
    }

    // ChatGPT-5を使用して企業情報を抽出
    const model = process.env.CHATGPT_MODEL || 'gpt-4o';
    console.log(`Using model: ${model} for company extraction`);

                    // gpt-5-miniモデルはtemperatureパラメータをサポートしていないため、条件分岐
                const requestOptions: any = {
                  model,
                  messages: [
                    {
                      role: "system",
                      content: `あなたは企業分析の専門家です。会話データから企業の詳細情報を抽出してください。

            抽出すべき情報：
            1. 企業名（正確な正式名称）
            2. 親業種（大分類）
            3. 業種（具体的な業種）
            4. 事業タグ（複数のキーワード）
            5. オリジナルタグ（企業独自の特徴）
            6. 地域（関東、関西など）
            7. 都道府県
            8. 企業の課題（複数の課題）
            9. 企業の強み（複数の強み）
            10. 備考（その他の重要情報）

            以下のJSON形式で返してください：
            {
              "company_info": {
                "company_name": "正式な企業名",
                "parent_industry": "親業種",
                "industry": "業種",
                "business_tags": ["タグ1", "タグ2", "タグ3"],
                "original_tags": ["特徴1", "特徴2"],
                "region": "地域",
                "prefecture": "都道府県",
                "notes": "備考・その他の情報"
              },
              "challenges": [
                {
                  "category": "課題カテゴリ",
                  "title": "課題タイトル",
                  "description": "課題の詳細説明",
                  "urgency": "高/中/低"
                }
              ],
              "strengths": [
                {
                  "category": "強みカテゴリ",
                  "title": "強みタイトル",
                  "description": "強みの詳細説明",
                  "impact": "高/中/低"
                }
              ]
            }`
                    },
                    {
                      role: "user",
                      content: `企業名: ${companyName}\n\n会話データ:\n${conversationData}`
                    }
                  ]
                };

                // gpt-5-mini以外のモデルではtemperatureを設定
                if (!model.includes('gpt-5-mini')) {
                  requestOptions.temperature = 0.3;
                }

                const completion = await openai.chat.completions.create(requestOptions);

                    const extractedContent = completion.choices[0]?.message?.content;
                if (!extractedContent) {
                  throw new Error('Failed to extract company information');
                }

                // マークダウンのコードブロックを除去
                let cleanedContent = extractedContent;
                if (cleanedContent.includes('```json')) {
                  cleanedContent = cleanedContent.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
                }
                if (cleanedContent.includes('```')) {
                  cleanedContent = cleanedContent.replace(/```\s*/g, '');
                }

                let extractedData;
                try {
                  extractedData = JSON.parse(cleanedContent);
                } catch (error) {
                  console.error('JSONパースエラー:', error);
                  console.error('パースしようとした内容:', cleanedContent);
                  throw new Error('Failed to parse extracted company data');
                }

                const { company_info, challenges, strengths } = extractedData;

                // 抽出された企業情報をログに表示
                console.log('=== ChatGPT Company Information Extraction ===');
                console.log(`Company Name: ${company_info.company_name || companyName}`);
                console.log(`Parent Industry: ${company_info.parent_industry}`);
                console.log(`Industry: ${company_info.industry}`);
                console.log(`Region: ${company_info.region}, Prefecture: ${company_info.prefecture}`);
                console.log(`Business Tags: ${JSON.stringify(company_info.business_tags)}`);
                console.log(`Original Tags: ${JSON.stringify(company_info.original_tags)}`);
                console.log(`Notes: ${company_info.notes}`);
                
                console.log('\n=== Extracted Challenges ===');
                if (challenges && challenges.length > 0) {
                  challenges.forEach((challenge: any, index: number) => {
                    console.log(`${index + 1}. ${challenge.title} (${challenge.category})`);
                    console.log(`   Description: ${challenge.description}`);
                    console.log(`   Urgency: ${challenge.urgency}`);
                    console.log('---');
                  });
                } else {
                  console.log('No challenges extracted');
                }

                console.log('\n=== Extracted Strengths ===');
                if (strengths && strengths.length > 0) {
                  strengths.forEach((strength: any, index: number) => {
                    console.log(`${index + 1}. ${strength.title} (${strength.category})`);
                    console.log(`   Description: ${strength.description}`);
                    console.log(`   Impact: ${strength.impact}`);
                    console.log('---');
                  });
                } else {
                  console.log('No strengths extracted');
                }
                console.log('=== Company Information Extraction Complete ===\n');

    // COMPANIESテーブルに挿入
    const { data: newCompany, error: insertError } = await supabase
      .from('companies')
      .insert({
        company_name: company_info.company_name || companyName,
        parent_industry: company_info.parent_industry || null,
        industry: company_info.industry,
        business_tags: company_info.business_tags || [],
        original_tags: company_info.original_tags || [],
        region: company_info.region,
        prefecture: company_info.prefecture,
        business_description: company_info.business_description,
        // 課題と強みをJSONBとして保存
        challenges: challenges || [],
        strengths: strengths || [],
        source_url: sourceUrl,
        extracted_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      throw new Error(`Failed to insert company: ${insertError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Company information extracted and stored successfully',
      companyId: newCompany.id,
      companyName: newCompany.company_name,
      extractedData: {
        company_info,
        challenges,
        strengths
      },
      model_used: model
    });

  } catch (error: unknown) {
    console.error('Company extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to extract company information: ${errorMessage}` },
      { status: 500 }
    );
  }
}
