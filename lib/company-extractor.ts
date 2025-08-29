/**
 * 会議タイトルから企業名を抽出するユーティリティ関数
 */

interface ExtractedCompanyInfo {
  companyName: string;
  rawTitle: string;
  meetingType: string;
  confidence: number;
}

/**
 * 会議タイトルから企業名を抽出
 * 例: "【取材】SP：株式会社オーダーメイドジャパン様" → "株式会社オーダーメイドジャパン"
 * 例: "【取材】SP：人光株式会社｜" → "人光株式会社"
 */
export function extractCompanyNameFromTitle(meetingTitle: string): ExtractedCompanyInfo {
  console.log(`企業名抽出開始: "${meetingTitle}"`);
  
  // 基本的なクリーニング
  const cleanTitle = meetingTitle.trim();
  
  // パターン1: 【取材】SP：企業名様 形式
  const pattern1 = /【.*?】.*?：(.+?)(?:様|｜|$)/;
  let match = cleanTitle.match(pattern1);
  
  if (match) {
    let companyName = match[1].trim();
    
    // 末尾の不要な文字を除去
    companyName = companyName.replace(/[｜\|〇○()（）【】\[\]]/g, '').trim();
    
    // 企業名として有効かチェック
    if (isValidCompanyName(companyName)) {
      console.log(`✅ パターン1で抽出成功: "${companyName}"`);
      return {
        companyName,
        rawTitle: meetingTitle,
        meetingType: extractMeetingType(meetingTitle),
        confidence: 0.9
      };
    }
  }
  
  // パターン2: より柔軟なパターン（コロン後の文字列）
  const pattern2 = /：(.+?)(?:様|｜|$)/;
  match = cleanTitle.match(pattern2);
  
  if (match) {
    let companyName = match[1].trim();
    companyName = companyName.replace(/[｜\|〇○()（）【】\[\]]/g, '').trim();
    
    if (isValidCompanyName(companyName)) {
      console.log(`✅ パターン2で抽出成功: "${companyName}"`);
      return {
        companyName,
        rawTitle: meetingTitle,
        meetingType: extractMeetingType(meetingTitle),
        confidence: 0.7
      };
    }
  }
  
  // パターン3: 株式会社、有限会社などの企業形態を含む文字列を検索
  const pattern3 = /(株式会社|有限会社|合同会社|合名会社|合資会社|一般社団法人|公益社団法人|NPO法人|学校法人|医療法人)[^｜〇○()（）【】\[\]]*?/;
  match = cleanTitle.match(pattern3);
  
  if (match) {
    const companyName = match[0].trim();
    
    if (isValidCompanyName(companyName)) {
      console.log(`✅ パターン3で抽出成功: "${companyName}"`);
      return {
        companyName,
        rawTitle: meetingTitle,
        meetingType: extractMeetingType(meetingTitle),
        confidence: 0.8
      };
    }
  }
  
  // 抽出失敗の場合
  console.log(`⚠️ 企業名抽出失敗: "${meetingTitle}"`);
  return {
    companyName: cleanTitle,
    rawTitle: meetingTitle,
    meetingType: extractMeetingType(meetingTitle),
    confidence: 0.1
  };
}

/**
 * 企業名として有効かチェック
 */
function isValidCompanyName(name: string): boolean {
  if (!name || name.length < 2) return false;
  if (name.length > 100) return false;
  
  // 明らかに企業名ではない文字列を除外
  const invalidPatterns = [
    /^[0-9]+$/,           // 数字のみ
    /^[a-zA-Z]+$/,        // アルファベットのみ（短い場合）
    /^[\s　]+$/,          // 空白のみ
    /取材|会議|ミーティング/,    // 会議関連のキーワード
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(name)) return false;
  }
  
  return true;
}

/**
 * 会議タイプを抽出
 */
function extractMeetingType(title: string): string {
  if (title.includes('取材')) return '取材';
  if (title.includes('商談')) return '商談';
  if (title.includes('面談')) return '面談';
  if (title.includes('打ち合わせ')) return '打ち合わせ';
  return '会議';
}

/**
 * 会話データから会議タイトルを抽出
 */
export function extractMeetingTitleFromConversation(conversationData: string): string | null {
  // "会議タイトル: " の後の文字列を抽出
  const match = conversationData.match(/会議タイトル:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

/**
 * 会話データから複数の企業を抽出（複数の会議が含まれている場合）
 */
export function extractMultipleCompaniesFromConversation(conversationData: string): ExtractedCompanyInfo[] {
  const companies: ExtractedCompanyInfo[] = [];
  
  // 複数の会議タイトルを検索
  const titlePattern = /会議タイトル:\s*(.+?)(?:\n|$)/g;
  let match;
  
  while ((match = titlePattern.exec(conversationData)) !== null) {
    const meetingTitle = match[1].trim();
    const companyInfo = extractCompanyNameFromTitle(meetingTitle);
    
    // 重複チェック
    if (!companies.find(c => c.companyName === companyInfo.companyName)) {
      companies.push(companyInfo);
    }
  }
  
  return companies;
}

/**
 * テスト用の関数
 */
export function testCompanyExtraction() {
  const testCases = [
    "【取材】SP：株式会社オーダーメイドジャパン様",
    "【取材】SP：人光株式会社｜",
    "【取材】SP：HAJIME AGENCY様｜",
    "【取材】SP：株式会社グローバルメンテナンス｜",
    "【取材】SP：iTec｜",
    "【取材】SP：株式会社2st planning｜ア(2)",
    "【取材】SP＋CM：cimagico｜様",
    "【取材】CM：株式会社一深建設｜様 深澤太郎",
  ];
  
  console.log('=== 企業名抽出テスト ===');
  testCases.forEach((title, index) => {
    const result = extractCompanyNameFromTitle(title);
    console.log(`${index + 1}. "${title}" → "${result.companyName}" (信頼度: ${result.confidence})`);
  });
}

/**
 * 特定の企業に関連する会話データのみを抽出
 * @param conversationData 全体の会話データ
 * @param targetCompanyName 対象企業名
 * @returns その企業に関連する会話データのみ
 */
export function extractCompanySpecificConversation(conversationData: string, targetCompanyName: string): string {
  console.log(`企業特定会話抽出開始: ${targetCompanyName}`);
  
  // 会議タイトルで分割
  const sections = conversationData.split(/(?=会議タイトル[:：])/);
  console.log(`会議セクション数: ${sections.length}`);
  
  // 対象企業に関連するセクションを探す
  for (const section of sections) {
    const lines = section.split('\n');
    const titleLine = lines.find(line => line.includes('会議タイトル'));
    
    if (titleLine) {
      // タイトルから企業名を抽出
      try {
        const extractedInfo = extractCompanyNameFromTitle(titleLine);
        console.log(`セクション企業名: ${extractedInfo.companyName}, 対象: ${targetCompanyName}`);
        
        // 企業名が一致するかチェック（部分一致も考慮）
        if (extractedInfo.companyName === targetCompanyName || 
            extractedInfo.companyName.includes(targetCompanyName) ||
            targetCompanyName.includes(extractedInfo.companyName)) {
          console.log(`✅ マッチした企業セクションを発見: ${extractedInfo.companyName}`);
          return section.trim();
        }
      } catch (error) {
        console.warn(`企業名抽出エラー (${titleLine}):`, error);
      }
    }
  }
  
  console.log(`❌ ${targetCompanyName}に対応するセクションが見つかりませんでした`);
  
  // マッチするセクションが見つからない場合は、元のデータをそのまま返す
  // （ただし、これは想定外のケース）
  console.warn(`フォールバック: 全体データを返します（${conversationData.length}文字）`);
  return conversationData;
}
