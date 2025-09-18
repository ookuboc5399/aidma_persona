import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { filterConversationData, extractSpeakers, FilterOptions, DEFAULT_EXCLUDE_SPEAKERS } from '../../../../lib/conversation-filter';
import { comprehensiveMatchChallenges } from '../../snowflake/comprehensive-match/route';
import { snowflakeClient } from '../../../../lib/snowflake';

// OpenAI クライアントは関数内で動的に作成

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// OpenAI APIを使用して課題を抽出
async function extractChallengesFromConversation(conversationData: string, companyName: string, useSecondaryKey: boolean = false): Promise<string[]> {
  try {
    // API KEY選択ロジック
    const apiKey = useSecondaryKey && process.env.OPENAI_API_KEY2 
      ? process.env.OPENAI_API_KEY2 
      : process.env.OPENAI_API_KEY;
    
    const keyType = useSecondaryKey ? 'OPENAI_API_KEY2' : 'OPENAI_API_KEY';
    console.log(`使用中のAPIキー: ${keyType}`);
    console.log(`${keyType} 存在確認:`, !!apiKey);
    console.log(`${keyType} 長さ:`, apiKey?.length || 0);

    // OpenAI クライアントを動的に作成
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    // モデル選択ロジック
    let model = process.env.CHATGPT_MODEL || 'gpt-4o';
    console.log(`Using model: ${model} for challenge extraction`);
    
    // GPT-5の利用可能性チェック
    if (model === 'gpt-5-mini-2025-08-07') {
      console.log('GPT-5モデルを使用中...');
      try {
        await openai.chat.completions.create({
          model: 'gpt-5-mini-2025-08-07',
          messages: [{ role: 'user', content: 'test' }],
          max_completion_tokens: 10
        });
        console.log('GPT-5が利用可能、課題抽出に使用');
      } catch (error: any) {
        console.warn(`GPT-5が利用できません: ${error.message}, GPT-4oにフォールバック`);
        model = 'gpt-4o';
      }
    }

    // 会話データの長さ制限（保守的に設定してトークン制限を防ぐ）
    let maxConversationLength;
    if (model === 'gpt-5-mini-2025-08-07') {
      maxConversationLength = 5000; // GPT-5でも保守的に設定
    } else if (model === 'gpt-4o' || model === 'gpt-4-turbo') {
      maxConversationLength = 8000; // GPT-4oも保守的に
    } else {
      maxConversationLength = 3000; // 従来のGPT-4は小さなコンテキスト
    }
    
    let truncatedData = conversationData;
    if (conversationData.length > maxConversationLength) {
      console.log(`会話データが長すぎます (${conversationData.length}文字)。${maxConversationLength}文字に切り詰めます。`);
      // 最初の部分を優先的に残す（重要な情報は通常冒頭にある）
      truncatedData = conversationData.substring(0, maxConversationLength) + "\n\n[注: 会話データが長いため一部省略されています]";
    }

    console.log(`課題抽出対象データ長: ${truncatedData.length}文字, モデル: ${model}`);
    console.log('=== 会話データサンプル（最初の500文字） ===');
    console.log(truncatedData.substring(0, 500) + '...');
    console.log('=== 会話データサンプル終了 ===');

    console.log('=== ChatGPT API 呼び出し開始 ===');
    console.log('使用モデル:', model);
    
    // GPT-5の利用可能性チェック
    if (model === 'gpt-5-mini-2025-08-07') {
      console.log('GPT-5モデルを使用中...');
      try {
        await openai.chat.completions.create({
          model: 'gpt-5-mini-2025-08-07',
          messages: [{ role: 'user', content: 'test' }],
          max_completion_tokens: 10
        });
        console.log('GPT-5が利用可能、課題抽出に使用');
      } catch (error: any) {
        console.warn(`GPT-5が利用できません: ${error.message}, GPT-4oにフォールバック`);
        model = 'gpt-4o';
      }
    }

    const completion = await openai.chat.completions.create({
      model,
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
${truncatedData}`
        }
      ],
      ...(model !== 'gpt-5-mini-2025-08-07' && { temperature: 0.3 }),
      ...(model === 'gpt-5-mini-2025-08-07' ? { max_completion_tokens: 1000 } : { max_tokens: 1000 }),
    });

    console.log('API レスポンス状態: 成功');
    console.log('API レスポンスデータ:', JSON.stringify(completion, null, 2));

    const challengesText = completion.choices[0]?.message?.content;
    const finishReason = completion.choices[0]?.finish_reason;
    
    console.log('=== ChatGPT 課題抽出レスポンス ===');
    console.log('生のレスポンス:', challengesText);
    console.log('レスポンス長:', challengesText?.length || 0, '文字');
    console.log('終了理由:', finishReason);

    console.log('PARSING CHALLENGES');
    console.log(challengesText);
    
    if (!challengesText || challengesText.trim() === '') {
      if (finishReason === 'length') {
        // セカンダリAPIキーがある場合は試行
        if (!useSecondaryKey && process.env.OPENAI_API_KEY2) {
          console.log('トークン制限に達しました。OPENAI_API_KEY2で再試行します。');
          return await extractChallengesFromConversation(conversationData, companyName, true);
        } else {
          // 簡単な課題を生成して返す（無限ループを防ぐ）
          console.log('トークン制限に達しました。一般的な課題を返します。');
          return [`${companyName}の営業効率化・デジタル化に関する課題`, `${companyName}の人材確保・スキルアップに関する課題`];
        }
      } else {
        throw new Error(`ChatGPTが空のレスポンスを返しました (終了理由: ${finishReason})`);
      }
    }
    
    // 箇条書きから配列に変換
    const challenges = challengesText
      .split('\n')
      .filter((line: string) => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().startsWith('*') || /^\d+\./.test(line.trim()))
      .map((line: string) => line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
      .filter((challenge: string) => challenge.length > 0);

    console.log('=== 抽出された課題一覧 ===');
    challenges.forEach((challenge: string, index: number) => {
      console.log(`${index + 1}. ${challenge}`);
      console.log(`   長さ: ${challenge.length}文字`);
      console.log(`   内容詳細: "${challenge}"`);
      console.log('---');
    });
    console.log(`総課題数: ${challenges.length}`);

    return challenges;
  } catch (error) {
    console.error('Challenge extraction error:', error);
    return [`課題抽出エラー: ${getErrorMessage(error)}`];
  }
}

// 課題からキーワードを抽出する関数
function extractKeywordsFromChallenges(challenges: string[]): string[] {
  const keywordMap: { [key: string]: string[] } = {
    'マーケティング': ['マーケティング', '広告', 'プロモーション', '宣伝', 'ブランディング', 'PR', 'デザイン', 'クリエイティブ'],
    '資料': ['資料', 'チラシ', 'パンフレット', 'カタログ', 'デザイン', 'DTP', '印刷', '制作'],
    '新規顧客': ['新規顧客', '営業', 'セールス', '開拓', 'アプローチ', '獲得', '集客', 'リード'],
    'アプローチ': ['営業', 'セールス', 'アプローチ', '提案', '商談', 'テレアポ', 'コールセンター'],
    '顧客獲得': ['営業', 'セールス', 'マーケティング', '集客', 'リード', '広告'],
    '売上': ['売上', '営業', 'セールス', '収益', 'マーケティング'],
    '競合': ['競合', '差別化', 'ブランディング', '戦略', 'コンサルティング'],
    '開発': ['開発', 'システム', 'IT', 'エンジニア', 'プログラミング', '技術'],
    '人材': ['人材', '採用', 'HR', '教育', '研修', 'トレーニング'],
    '効率': ['効率', 'システム', 'IT', '自動化', 'DX', 'デジタル'],
    '品質': ['品質', '改善', 'コンサルティング', '管理', '監査']
  };

  const keywords = new Set<string>();
  
  challenges.forEach(challenge => {
    const challengeUpper = challenge.toUpperCase();
    
    Object.entries(keywordMap).forEach(([key, values]) => {
      if (challengeUpper.includes(key.toUpperCase())) {
        values.forEach(keyword => keywords.add(keyword));
      }
    });
    
    // 課題文から直接キーワードを抽出
    const directKeywords = challenge.match(/[ァ-ヶー]+|[a-zA-Z]+/g) || [];
    directKeywords.forEach(keyword => {
      if (keyword.length >= 2) {
        keywords.add(keyword);
      }
    });
  });
  
  return Array.from(keywords).slice(0, 10); // 最大10個のキーワード
}

// ChatGPT マッチング関数
async function chatGPTMatching(challenges: string[]): Promise<any[]> {
  try {
    console.log('🤖 ChatGPT マッチング処理実行');
    console.log(`課題: ${challenges.join(', ')}`);
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 課題に関連するキーワードを抽出
    const challengeKeywords = extractKeywordsFromChallenges(challenges);
    console.log(`課題関連キーワード: ${challengeKeywords.join(', ')}`);

    // 課題に関連する企業データを複数の方法で取得して多様性を確保
    let companies: any[] = [];
    
    // 1. 課題関連度の高い企業を取得 (30社)
    if (challengeKeywords.length > 0) {
      const relevantCompaniesQuery = `
        SELECT 
          COMPANY_ID, COMPANY_NAME, INDUSTRY, REGION, PREFECTURE,
          BUSINESS_TAGS, ORIGINAL_TAGS, BUSINESS_DESCRIPTION,
          CHALLENGES, STRENGTHS, OFFICIAL_WEBSITE, CONSULTANT_NAME,
          (
            ${challengeKeywords.map(keyword => 
              `CASE WHEN UPPER(BUSINESS_DESCRIPTION) LIKE UPPER('%${keyword}%') 
                    OR UPPER(BUSINESS_TAGS) LIKE UPPER('%${keyword}%') 
                    OR UPPER(STRENGTHS) LIKE UPPER('%${keyword}%') 
               THEN 1 ELSE 0 END`
            ).join(' + ')}
          ) as relevance_score
        FROM COMPANIES
        WHERE COMPANY_NAME IS NOT NULL 
          AND BUSINESS_DESCRIPTION IS NOT NULL 
          AND BUSINESS_DESCRIPTION != ''
        ORDER BY relevance_score DESC, RANDOM()
        LIMIT 30
      `;
      
      const relevantCompanies = await snowflakeClient.executeQuery(relevantCompaniesQuery);
      companies.push(...relevantCompanies);
      console.log(`関連度重視企業取得: ${relevantCompanies.length}社`);
    }
    
    // 2. ランダムな企業を取得して多様性を確保 (20社)
    const randomCompaniesQuery = `
      SELECT 
        COMPANY_ID, COMPANY_NAME, INDUSTRY, REGION, PREFECTURE,
        BUSINESS_TAGS, ORIGINAL_TAGS, BUSINESS_DESCRIPTION,
        CHALLENGES, STRENGTHS, OFFICIAL_WEBSITE, CONSULTANT_NAME,
        0 as relevance_score
      FROM COMPANIES
      WHERE COMPANY_NAME IS NOT NULL 
        AND BUSINESS_DESCRIPTION IS NOT NULL 
        AND BUSINESS_DESCRIPTION != ''
        AND COMPANY_ID NOT IN (${companies.map(c => `'${c.COMPANY_ID}'`).join(',') || "''"})
      ORDER BY RANDOM()
      LIMIT 20
    `;
    
     const randomCompanies = await snowflakeClient.executeQuery(randomCompaniesQuery);
     companies.push(...randomCompanies);
     
     // デバッグ: 実際のCONSULTANT_NAMEデータを確認
     console.log(`=== CONSULTANT_NAMEデバッグ（最初の5件）===`);
     companies.slice(0, 5).forEach((company, index) => {
       console.log(`企業${index + 1}: ${company.COMPANY_NAME} → コンサルタント名: "${company.CONSULTANT_NAME}"`);
     });
    
    // デバッグ: companiesの型を確認
    console.log(`companies type:`, typeof companies);
    console.log(`companies is Array:`, Array.isArray(companies));
    console.log(`companies length:`, companies?.length || 'undefined');
    
    // companiesが配列でない場合は空配列に修正
    if (!Array.isArray(companies)) {
      console.warn(`⚠️ companies is not an array, resetting to empty array`);
      companies = [];
    }
    
    console.log(`総企業データ取得: ${companies.length}社`);
    console.log(`関連度の高い企業上位5社:`, companies.slice(0, 5).map(c => ({
      name: c.COMPANY_NAME,
      score: c.RELEVANCE_SCORE || c.relevance_score,
      industry: c.INDUSTRY
    })));

    const prompt = `
以下の課題を解決できる企業を3社選んでください。

【重要な選択基準】
1. この特定の課題に対して最も専門性が高い企業を選ぶ
2. 課題の内容に最も適した事業内容・強み・タグを持つ企業を優先する
3. 汎用的な企業ではなく、この課題領域に特化した企業を選ぶ
4. 異なる課題には異なる企業を選ぶ（同じ企業を複数の課題で選ばない）

課題:
${challenges.map((challenge, index) => `${index + 1}. ${challenge}`).join('\n')}

企業データ:
${companies.map((company: any, index: number) => {
  return `${index + 1}. 企業名: ${company.COMPANY_NAME}
   業種: ${company.INDUSTRY}
   地域: ${company.REGION}
   事業内容: ${company.BUSINESS_DESCRIPTION}
   強み: ${company.STRENGTHS}
   タグ: ${company.BUSINESS_TAGS}
   コンサルタント名: ${company.CONSULTANT_NAME || 'なし'}
   [デバッグ] 実際のDB値: "${company.CONSULTANT_NAME}"`;
}).join('\n')}

以下のJSON形式で回答してください:
{
  "matches": [
    {
      "challenge": "解決する課題の全文",
      "company_id": "企業ID",
      "company_name": "企業名",
      "industry": "業種",
      "region": "地域",
      "prefecture": "都道府県",
      "business_tags": "ビジネスタグ",
      "original_tags": "オリジナルタグ",
      "business_description": "事業内容",
      "challenges": "企業が抱える課題",
      "strengths": "企業の強み",
      "official_website": "公式サイト",
      "consultant_name": "企業データに記載されているコンサルタント名そのまま（「なし」の場合は空文字\"\"、絶対に架空の名前を生成しない）",
      "match_score": 0.95,
      "match_reason": "マッチング理由",
      "solution_details": "解決方法の詳細"
    }
  ]
}

【重要な注意事項】
- consultant_nameは企業データに記載されている値をそのまま使用すること
- 企業データで「なし」と表示されている場合は空文字（""）を返すこと
- 田中太郎、佐藤花子のような架空の名前を絶対に生成しないこと
- 全ての情報は提供された企業データから正確にコピーすること
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "あなたは企業マッチングの専門家です。提示された特定の課題を解決できる最適な企業を選出してください。【重要】各課題に対して、その課題の専門領域に最も特化した企業を選んでください。汎用的な企業ではなく、課題領域に深い専門性を持つ企業を優先してください。同じ企業を複数の異なる課題で選ばないよう、課題ごとに最適な企業を慎重に選択してください。【絶対禁止】提供された企業データに記載されている情報のみを使用し、データにない情報は絶対に推測・生成・創作しないでください。特にconsultant_nameは、企業データで「なし」と表示されている場合は空文字（\"\"）を返し、田中太郎や佐藤花子のような架空の名前を絶対に生成しないでください。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('ChatGPT response is empty');
    }

    // マークダウンのコードブロック形式を処理
    let jsonContent = content;
    if (content.includes('```json')) {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
    } else if (content.includes('```')) {
      const codeMatch = content.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch) {
        jsonContent = codeMatch[1];
      }
    }

    console.log('ChatGPT raw response:', content);
    console.log('Extracted JSON:', jsonContent);

    let result;
    try {
      result = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Failed to parse content:', jsonContent);
      throw new Error(`Failed to parse ChatGPT response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    console.log(`✅ ChatGPT マッチング結果: ${result.matches?.length || 0}社が選出されました`);
    
    // 架空の名前をフィルタリングする安全装置
    const suspiciousNames = ['田中太郎', '佐藤花子', '山田太郎', '鈴木一郎', '佐藤太郎', '田中花子'];
    if (result.matches) {
      result.matches.forEach((match: any, index: number) => {
        if (match.consultant_name && suspiciousNames.includes(match.consultant_name)) {
          console.warn(`⚠️ 架空の名前を検出: ${match.consultant_name} → 空文字に修正`);
          match.consultant_name = '';
        }
      });
    }
    
    return [{
      success: true,
      inputChallenges: challenges,
      totalMatches: result.matches?.length || 0,
      comprehensiveMatches: result.matches || [],
      dataSource: 'chatgpt',
      matchingMethod: 'ai-powered-matching'
    }];

  } catch (error: unknown) {
    console.error('❌ ChatGPT マッチングエラー:', error);
    throw error;
  }
}

// セマンティック検索関数
async function semanticMatching(challenges: string[]): Promise<any[]> {
  try {
    console.log('🔍 セマンティック検索実行');
    const allMatches: any[] = [];

    for (const challenge of challenges) {
      // 課題をクリーンアップ
      const cleanChallenge = challenge
        .replace(/[**]/g, '')
        .replace(/[:：]/g, ' ')
        .substring(0, 200);

      const escapedChallenge = cleanChallenge.replace(/'/g, "''");

      // キーワード抽出
      const keywords = cleanChallenge
        .split(/[\s、。]/)
        .filter(word => word.length > 2)
        .slice(0, 5);

      const keywordConditions = keywords.map(keyword => 
        `(BUSINESS_DESCRIPTION LIKE '%${keyword}%' OR INDUSTRY LIKE '%${keyword}%' OR BUSINESS_TAGS LIKE '%${keyword}%')`
      ).join(' OR ');

      const semanticQuery = `
        SELECT
          COMPANY_ID,
          COMPANY_NAME,
          INDUSTRY,
          REGION,
          PREFECTURE,
          BUSINESS_TAGS,
          ORIGINAL_TAGS,
          BUSINESS_DESCRIPTION,
          CHALLENGES,
          STRENGTHS,
          OFFICIAL_WEBSITE,
          CONSULTANT_NAME,
          CASE 
            WHEN ${keywordConditions} THEN 0.7
            ELSE 0.3
          END as match_score,
          'セマンティック検索によるマッチング' as match_reason,
          'キーワードベースの類似度検索' as solution_details
        FROM COMPANIES
        WHERE COMPANY_NAME IS NOT NULL
          AND BUSINESS_DESCRIPTION IS NOT NULL
          AND BUSINESS_DESCRIPTION != ''
        ORDER BY match_score DESC, RANDOM()
        LIMIT 50
      `;

      const results = await snowflakeClient.executeQuery(semanticQuery);
      const challengeMatches = results.map((row: any) => ({
        challenge: challenge,
        company_id: row.COMPANY_ID,
        company_name: row.COMPANY_NAME,
        industry: row.INDUSTRY,
        region: row.REGION,
        prefecture: row.PREFECTURE,
        business_tags: row.BUSINESS_TAGS,
        original_tags: row.ORIGINAL_TAGS,
        business_description: row.BUSINESS_DESCRIPTION,
        challenges: row.CHALLENGES,
        strengths: row.STRENGTHS,
        official_website: row.OFFICIAL_WEBSITE,
        consultant_name: row.CONSULTANT_NAME,
        match_score: row.MATCH_SCORE,
        match_reason: row.MATCH_REASON,
        solution_details: row.SOLUTION_DETAILS
      }));

      allMatches.push(...challengeMatches);
    }

    console.log(`✅ セマンティック検索結果: ${allMatches.length}社が選出されました`);
    
    return [{
      success: true,
      inputChallenges: challenges,
      totalMatches: allMatches.length,
      comprehensiveMatches: allMatches.slice(0, 3),
      dataSource: 'semantic-search',
      matchingMethod: 'keyword-based-semantic-matching'
    }];

  } catch (error: unknown) {
    console.error('❌ セマンティック検索エラー:', error);
    throw error;
  }
}

// 総合課題マッチング - すべての課題を考慮して最適な企業を選出
async function findMatchingCompanies(challenges: string[]): Promise<any[]> {
  try {
    console.log('=== 課題別個別マッチング開始 ===');
    console.log(`課題数: ${challenges.length}`);
    challenges.forEach((challenge, index) => {
      console.log(`課題${index + 1}: ${challenge}`);
    });

    const results = [];

    // 各課題に対して個別にマッチング処理を実行
    for (let i = 0; i < challenges.length; i++) {
      const challenge = challenges[i];
      console.log(`\n--- 課題${i + 1}のマッチング処理開始: ${challenge} ---`);

      // 1. ChatGPT マッチング (第一優先) - 単一課題で実行
      try {
        const chatGPTResult = await chatGPTMatching([challenge]); // 単一課題で実行
        if (chatGPTResult[0].success && chatGPTResult[0].comprehensiveMatches.length > 0) {
          console.log(`✅ 課題${i + 1} ChatGPT マッチング成功`);
          results.push({
            challenge: challenge,
            matches: chatGPTResult[0].comprehensiveMatches || [],
            matchingMethod: 'chatgpt-matching',
            totalScore: chatGPTResult[0].comprehensiveMatches?.reduce((sum: number, match: any) => sum + (match.match_score || 0), 0) || 0
          });
          continue; // 次の課題へ
        }
      } catch (error) {
        console.log(`⚠️ 課題${i + 1} ChatGPT マッチング失敗、次の方法を試行します`);
      }

      // 2. Snowflake AI マッチング (第二優先) - 単一課題で実行
      try {
        console.log(`🔄 課題${i + 1} Snowflake AI マッチング処理実行`);
        
        const aiMatchResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/snowflake/ai-match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenges: [challenge] }) // 単一課題で実行
        });

        if (aiMatchResponse.ok) {
          const aiResult = await aiMatchResponse.json();
          console.log(`✅ 課題${i + 1} Snowflake AI マッチング結果: ${aiResult.totalMatches}社が選出されました`);
          
          if (aiResult.matches && aiResult.matches.length > 0) {
            const limitedMatches = aiResult.matches.slice(0, 3);
            results.push({
              challenge: challenge,
              matches: limitedMatches || [],
              matchingMethod: 'snowflake-ai-matching',
              totalScore: limitedMatches?.reduce((sum: number, match: any) => sum + (match.match_score || 0), 0) || 0
            });
            continue; // 次の課題へ
          }
        }
      } catch (error) {
        console.log(`⚠️ 課題${i + 1} Snowflake AI マッチング失敗、次の方法を試行します`);
      }

      // 3. セマンティック検索 (第三優先) - 単一課題で実行
      try {
        const semanticResult = await semanticMatching([challenge]); // 単一課題で実行
        if (semanticResult[0].success && semanticResult[0].comprehensiveMatches.length > 0) {
          console.log(`✅ 課題${i + 1} セマンティック検索成功`);
          results.push({
            challenge: challenge,
            matches: semanticResult[0].comprehensiveMatches || [],
            matchingMethod: 'semantic-matching',
            totalScore: semanticResult[0].comprehensiveMatches?.reduce((sum: number, match: any) => sum + (match.match_score || 0), 0) || 0
          });
          continue; // 次の課題へ
        }
      } catch (error) {
        console.log(`⚠️ 課題${i + 1} セマンティック検索失敗、最終手段を実行します`);
      }

      // 4. ランダム選択 (最終手段) - 単一課題で実行
      console.log(`🎲 課題${i + 1} ランダム企業選出を実行`);
      const randomQuery = `
        SELECT
          COMPANY_ID,
          COMPANY_NAME,
          INDUSTRY,
          REGION,
          PREFECTURE,
          BUSINESS_TAGS,
          ORIGINAL_TAGS,
          BUSINESS_DESCRIPTION,
          CHALLENGES,
          STRENGTHS,
          OFFICIAL_WEBSITE,
          CONSULTANT_NAME,
          0.3 as match_score,
          'ランダム選出' as match_reason,
          'システムによる自動選出' as solution_details
        FROM COMPANIES
        WHERE COMPANY_NAME IS NOT NULL
          AND BUSINESS_DESCRIPTION IS NOT NULL
          AND BUSINESS_DESCRIPTION != ''
        ORDER BY RANDOM()
        LIMIT 3
      `;
      
      const randomResults = await snowflakeClient.executeQuery(randomQuery);
      const randomMatches = randomResults.map((row: any) => ({
        challenge: challenge,
      company_id: row.COMPANY_ID,
      company_name: row.COMPANY_NAME,
      industry: row.INDUSTRY,
      region: row.REGION,
      prefecture: row.PREFECTURE,
        business_tags: row.BUSINESS_TAGS,
        original_tags: row.ORIGINAL_TAGS,
        business_description: row.BUSINESS_DESCRIPTION,
        challenges: row.CHALLENGES,
        strengths: row.STRENGTHS,
        official_website: row.OFFICIAL_WEBSITE,
        consultant_name: row.CONSULTANT_NAME,
        match_score: row.MATCH_SCORE,
        match_reason: row.MATCH_REASON,
        solution_details: row.SOLUTION_DETAILS
      }));

      console.log(`✅ 課題${i + 1} ランダム選出結果: ${randomMatches.length}社が選出されました`);
      
      results.push({
        challenge: challenge,
        matches: randomMatches || [],
        matchingMethod: 'random-matching',
        totalScore: randomMatches?.reduce((sum: number, match: any) => sum + (match.match_score || 0), 0) || 0
      });

      // 課題間の処理で多様性を確保するため短い遅延を追加
      if (i < challenges.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n=== 課題別個別マッチング完了 ===`);
    console.log(`処理した課題数: ${challenges.length}`);
    console.log(`マッチング結果数: ${results.length}`);
    
    return results;

  } catch (matchingError) {
    console.error(`🚨 課題別マッチング処理エラー:`, matchingError);
    // 各課題に対してエラー結果を返す
    return challenges.map(challenge => ({
      challenge: challenge,
      matches: [],
      matchingMethod: 'error-fallback',
      error: `Processing Error: ${getErrorMessage(matchingError)}`
    }));
  }
}

export async function POST(req: NextRequest) {
  let requestData: any = {};
  try {
    requestData = await req.json();
    const { 
      companyName, 
      conversationData, 
      columnLetter, 
      extractionMethod,
      sheetType = 'CL',
      excludeSpeakers,
      includeSpeakers,
      excludeKeywords
    } = requestData;
    
    if (!companyName || !conversationData) {
      return NextResponse.json({ 
        error: 'companyName and conversationData are required' 
      }, { status: 400 });
    }

    console.log(`=== ${companyName}の課題抽出・マッチング処理開始 ===`);
    console.log(`企業名: ${companyName}`);
    console.log(`列: ${columnLetter || '不明'}`);
    console.log(`抽出方法: ${extractionMethod || '不明'}`);
    console.log(`シートタイプ: ${sheetType}`);

    // 会話データの話者情報を分析
    const originalSpeakers = extractSpeakers(conversationData);
    console.log(`会話参加者: ${originalSpeakers.join(', ')}`);

    // 話者フィルターを適用（デフォルトフィルターを常に適用）
    let processedConversationData = conversationData;
    let filterStats = null;
    
    // デフォルトの除外話者リストと追加指定された除外話者を結合
    const allExcludeSpeakers = [
      ...DEFAULT_EXCLUDE_SPEAKERS,
      ...(excludeSpeakers || [])
    ];
    
    const filterOptions: FilterOptions = {
      excludeSpeakers: allExcludeSpeakers,
      includeSpeakers,
      excludeKeywords
    };
    
    const filterResult = filterConversationData(conversationData, filterOptions);
    processedConversationData = filterResult.filteredData;
    filterStats = {
      originalSpeakers: filterResult.originalSpeakers,
      includedSpeakers: filterResult.includedSpeakers,
      excludedSpeakers: filterResult.excludedSpeakers,
      includedLines: filterResult.includedLines,
      excludedLines: filterResult.excludedLines
    };
    
    console.log(`話者フィルター適用:`);
    console.log(`- 除外された話者: ${filterResult.excludedSpeakers.join(', ') || 'なし'}`);
    console.log(`- 残った話者: ${filterResult.includedSpeakers.join(', ')}`);
    console.log(`- 除外された発言: ${filterResult.excludedLines}件`);
    console.log(`- 残った発言: ${filterResult.includedLines}件`);

    // 除外された話者をSnowflakeのCONSULTANT_NAME列に保存
    console.log(`🔍 除外話者保存処理開始: ${filterResult.excludedSpeakers.length}名の話者が除外されました`);
    if (filterResult.excludedSpeakers.length > 0) {
      console.log(`📝 保存対象の除外話者: [${filterResult.excludedSpeakers.join(', ')}]`);
      console.log(`🏢 対象企業: ${companyName}`);
      
      try {
        const { updateCompanyConsultant } = await import('@/lib/snowflake');
        console.log(`🔄 updateCompanyConsultant関数を呼び出し中...`);
        await updateCompanyConsultant(companyName, filterResult.excludedSpeakers);
        console.log(`✅ 企業「${companyName}」の除外話者情報をSnowflakeに保存しました: ${filterResult.excludedSpeakers.join(', ')}`);
      } catch (error) {
        console.error(`❌ 企業「${companyName}」の除外話者情報保存中にエラーが発生しました:`, error);
        console.error(`エラーの詳細:`, error instanceof Error ? error.message : String(error));
        console.error(`スタックトレース:`, error instanceof Error ? error.stack : 'N/A');
        // エラーが発生しても処理は継続
      }
    } else {
      console.log(`ℹ️ 除外された話者がいないため、CONSULTANT_NAME列の更新をスキップします`);
    }

    // 1. 課題抽出
    console.log('課題抽出中...');
    const challenges = await extractChallengesFromConversation(processedConversationData, companyName);
    console.log(`抽出された課題数: ${challenges.length}`);

    // 2. マッチング
    console.log('マッチング処理中...');
    const matchingResults = await findMatchingCompanies(challenges);
    console.log(`マッチング結果: ${matchingResults.length}件の課題に対してマッチング完了`);

    // 課題別マッチング結果を課題との関連性を保持して統合
    const challengeBasedMatches = matchingResults.flatMap(result => {
      return (result.matches || []).map((match: any) => ({
        ...match,
        challenge: result.challenge,
        challengeMatchingMethod: result.matchingMethod,
        challengeScore: match.match_score || 0
      }));
    });
    
    const selectedCompanies = challengeBasedMatches;
    
    console.log('=== マッチング結果デバッグ ===');
    console.log(`matchingResults長さ: ${matchingResults.length}`);
    console.log(`課題別マッチング統合数: ${challengeBasedMatches.length}`);
    console.log(`課題別結果詳細:`, matchingResults.map(r => ({
      challenge: r.challenge?.substring(0, 50) + '...',
      matchCount: r.matches?.length || 0,
      method: r.matchingMethod,
      topCompany: r.matches?.[0]?.company_name || 'なし'
    })));
    console.log(`selectedCompanies長さ: ${selectedCompanies.length}`);
    
    // 課題別マッチング結果の詳細ログ
    selectedCompanies.forEach((match, index) => {
      if (index < 5) { // 最初の5件のみログ出力
        console.log(`マッチ${index + 1}: ${match.company_name} → 課題「${match.challenge?.substring(0, 30)}...」`);
      }
    });

    const result = {
      success: true,
      companyName,
      columnLetter: columnLetter || '不明',
      extractionMethod: extractionMethod || '不明',
      challenges,
      comprehensiveMatches: selectedCompanies,
      matches: selectedCompanies, // write-resultsで使用される形式に合わせて追加
      matchingMethod: 'comprehensive-multi-challenge-evaluation',
      totalChallenges: challenges.length,
      selectedCompaniesCount: selectedCompanies.length,
      processedAt: new Date().toISOString(),
      filterStats,
      summary: {
        challengesExtracted: challenges.length,
        matchingApproach: '全課題を総合的に評価して最適企業を選出',
        selectedCompanies: selectedCompanies.length,
        topCompany: selectedCompanies.length > 0 ? selectedCompanies[0].company_name : null,
        speakerFiltering: filterStats ? {
          originalSpeakersCount: filterStats.originalSpeakers.length,
          includedSpeakersCount: filterStats.includedSpeakers.length,
          excludedSpeakersCount: filterStats.excludedSpeakers.length,
          filteredLinesCount: filterStats.includedLines,
          excludedLinesCount: filterStats.excludedLines
        } : null
      }
    };

    console.log(`✅ ${companyName}の課題抽出・総合マッチング処理完了`);
    console.log(`- 抽出課題数: ${challenges.length}`);
    console.log(`- 選出企業数: ${selectedCompanies.length}`);
    if (selectedCompanies.length > 0) {
      console.log(`- 最適企業: ${selectedCompanies[0].company_name} (スコア: ${selectedCompanies[0].total_score?.toFixed(3) || 'N/A'})`);
    }

    return NextResponse.json({
      ...result,
      sheetType
    });

  } catch (error: unknown) {
    console.error('単一企業の課題抽出・マッチング処理エラー:', error);
    const errorMessage = getErrorMessage(error);
    return NextResponse.json({ 
      success: false,
      error: errorMessage,
      companyName: requestData?.companyName || '不明',
      sheetType: requestData?.sheetType || 'CL',
      processedAt: new Date().toISOString()
    }, { status: 500 });
  }
}
