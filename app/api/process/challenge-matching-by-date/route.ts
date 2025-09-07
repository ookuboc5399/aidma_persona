import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '../../../../lib/google';
import { extractMultipleCompaniesFromConversation } from '../../../../lib/company-extractor';

function getSheetIdFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// OpenAI APIを使用して課題を抽出
async function extractChallengesFromConversation(conversationData: string, companyName: string): Promise<string[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify((() => {
        const model = process.env.CHATGPT_MODEL || 'gpt-4o';
        const requestBody: any = {
          model: model,
          messages: [
            {
              role: 'system',
              content: `あなたは企業の事業課題を抽出する専門家です。会話データから${companyName}が抱えている事業課題を抽出・分析し、企業の成長と改善に繋がる具体的な問題点を明確にしてください。`
            },
            {
              role: 'user',
              content: `以下の会話データから「${companyName}」が抱えている事業課題を箇条書きで5〜10個抽出してください。

事業課題とは、企業の売上、利益、成長に直接的な影響を与える問題や機会を指します。
例えば、新規顧客獲得の困難、市場シェアの低下、製品開発の遅れ、競合の台頭などが含まれます。

以下の点は事業課題から除外してください:
- 個々の顧客とのやり取りや特定の契約に関する問題
- 社内の日常的な業務連絡や手続きの遅延
- 担当者レベルのコミュニケーションや引継ぎの問題

良い抽出例:
- 新規事業のアイデアが不足しており、新たな収益源の確保ができていない。
- 主力製品の市場競争力が低下し、売上が伸び悩んでいる。
- 若手エンジニアの採用が難航し、開発チームの増強が計画通りに進んでいない。

悪い抽出例:
- 担当者が頻繁に休職し、引き継ぎが不十分。
- 顧客へのサービス内容の説明が不足している。
- 契約期間の管理が徹底されていない。

会話データ:
${conversationData}`
            }
          ]
        };
        
        // GPT-5の場合はmax_completion_tokens、それ以外はmax_tokens
        if (model === 'gpt-5-mini-2025-08-07') {
          requestBody.max_completion_tokens = 1000;
        } else {
          requestBody.max_tokens = 1000;
          requestBody.temperature = 0.3;
        }
        
        return requestBody;
      })())
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${data.error?.message || 'Unknown error'}`);
    }

    const challengesText = data.choices[0].message.content;
    // 箇条書きから配列に変換
    const challenges = challengesText
      .split('\n')
      .filter((line: string) => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().startsWith('*') || /^\d+\./.test(line.trim()))
      .map((line: string) => line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
      .filter((challenge: string) => challenge.length > 0);

    return challenges;
  } catch (error) {
    console.error('Challenge extraction error:', error);
    return [`課題抽出エラー: ${getErrorMessage(error)}`];
  }
}

// Snowflake AIを使用してマッチング
async function findMatchingCompanies(challenges: string[]): Promise<any[]> {
  try {
    const matchingPromises = challenges.map(async (challenge) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/snowflake/ai-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Snowflake AI match error: ${error}`);
      }

      const result = await response.json();
      return {
        challenge,
        matches: result.matches || []
      };
    });

    const results = await Promise.all(matchingPromises);
    return results;
  } catch (error) {
    console.error('Matching error:', error);
    return [{
      challenge: 'マッチングエラー',
      matches: [],
      error: getErrorMessage(error)
    }];
  }
}

export async function POST(req: NextRequest) {
  try {
    const { date, url, sheetType = 'CL' } = await req.json();
    
    if (!date || !url) {
      return NextResponse.json({ error: 'Date and URL are required' }, { status: 400 });
    }

    // シートタイプの検証
    if (!['CL', 'CU', 'CP'].includes(sheetType)) {
      return NextResponse.json({ error: 'Invalid sheet type. Must be CL, CU, or CP' }, { status: 400 });
    }

    console.log('=== 指定日付の課題抽出・マッチング処理開始 ===');
    console.log(`対象日付: ${date}`);
    console.log(`対象URL: ${url}`);
    console.log(`シートタイプ: ${sheetType}`);
    console.log(`📊 参照シート: ${sheetType}シート | URL: ${url}`);

    // 1. 指定日付の企業データを取得
    const companiesApiEndpoint = sheetType === 'CL' ? '/api/sheets/get-cl-companies-by-date' :
                                sheetType === 'CU' ? '/api/sheets/get-cu-companies-by-date' :
                                '/api/sheets/get-cp-companies-by-date';
    
    const companiesResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}${companiesApiEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, url })
    });

    if (!companiesResponse.ok) {
      const error = await companiesResponse.text();
      throw new Error(`Failed to get companies: ${error}`);
    }

    const companiesData = await companiesResponse.json();
    const companies = companiesData.companies || [];

    if (companies.length === 0) {
      return NextResponse.json({
        success: true,
        message: '指定日付に課題抽出対象の企業が見つかりませんでした',
        date,
        results: [],
        totalCompanies: 0
      });
    }

    console.log(`✅ ${companies.length}社の企業データを取得`);

    // 2. 各企業の課題抽出とマッチング処理
    const processingResults = [];
    
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      console.log(`\n--- 企業 ${i + 1}/${companies.length}: ${company.companyName} ---`);

      try {
        // 課題抽出
        console.log('課題抽出中...');
        const challenges = await extractChallengesFromConversation(
          company.conversationData, 
          company.companyName
        );

        // マッチング
        console.log('マッチング処理中...');
        const matchingResults = await findMatchingCompanies(challenges);

        processingResults.push({
          companyName: company.companyName,
          columnLetter: company.columnLetter,
          extractionMethod: company.extractionMethod,
          challenges,
          matchingResults,
          success: true,
          processedAt: new Date().toISOString()
        });

        console.log(`✅ ${company.companyName}の処理完了`);

        // API制限を避けるため短い間隔を設ける
        if (i < companies.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ ${company.companyName}の処理エラー:`, error);
        processingResults.push({
          companyName: company.companyName,
          columnLetter: company.columnLetter,
          extractionMethod: company.extractionMethod,
          challenges: [],
          matchingResults: [],
          success: false,
          error: getErrorMessage(error),
          processedAt: new Date().toISOString()
        });
      }
    }

    const successCount = processingResults.filter(r => r.success).length;
    const errorCount = processingResults.filter(r => !r.success).length;

    console.log(`\n=== 指定日付の課題抽出・マッチング処理完了 ===`);
    console.log(`成功: ${successCount}社, エラー: ${errorCount}社`);

    return NextResponse.json({
      success: true,
      message: `${date}の課題抽出・マッチング処理が完了しました`,
      date,
      sheetType,
      results: processingResults,
      totalCompanies: companies.length,
      successCount,
      errorCount,
      summary: {
        processedAt: new Date().toISOString(),
        targetDate: date,
        targetUrl: url,
        sheetType
      }
    });

  } catch (error: unknown) {
    console.error('指定日付の課題抽出・マッチング処理エラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ 
      error: errorMessage,
      success: false 
    }, { status: 500 });
  }
}
