/**
 * 話者フィルターのオプション設定
 */
export interface FilterOptions {
  excludeSpeakers?: string[];
  includeSpeakers?: string[];
  excludeKeywords?: string[];
}

/**
 * フィルター結果
 */
export interface FilterResult {
  filteredData: string;
  originalSpeakers: string[];
  includedSpeakers: string[];
  excludedSpeakers: string[];
  excludedLines: number;
  includedLines: number;
}

/**
 * 会話データから話者を抽出する関数
 * @param conversationData 会話データ文字列
 * @returns 抽出された話者のリスト
 */
export function extractSpeakers(conversationData: string): string[] {
  const speakers: Set<string> = new Set();
  const lines = conversationData.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // パターン1: 話者名とタイムスタンプのパターン
    // 例: "高山竜馬 00:00:00" または "川原美穂 00:00:10"
    const timestampMatch = trimmedLine.match(/^([^\s\d]+(?:\s+[^\s\d]+)*)\s+\d{2}:\d{2}:\d{2}/);
    if (timestampMatch) {
      speakers.add(timestampMatch[1].trim());
      continue;
    }
    
    // パターン2: 話者名のみの行（次の行に発言がある形式）
    // よりシンプルな条件で話者名を検出
    if (trimmedLine && 
        !trimmedLine.includes('会議タイトル:') && 
        !trimmedLine.includes('会議日時:') && 
        !trimmedLine.includes('参加者:') && 
        !trimmedLine.includes('文字起こし:') &&
        !trimmedLine.includes('=== ') &&
        !trimmedLine.match(/^\d{4}\/\d{2}\/\d{2}/) && // 日付パターンを除外
        !trimmedLine.match(/^\d{2}:\d{2}/) && // 時刻パターンを除外
        trimmedLine.length > 0 && 
        trimmedLine.length < 50 && // 長すぎる行は除外
        !trimmedLine.includes('。') && // 句点を含む行は発言の可能性が高い
        !trimmedLine.includes('、') && // 読点を含む行は発言の可能性が高い
        !trimmedLine.includes('？') && // 疑問符を含む行は発言の可能性が高い
        !trimmedLine.includes('！') && // 感嘆符を含む行は発言の可能性が高い
        !trimmedLine.includes('です') && // 丁寧語を含む行は発言の可能性が高い
        !trimmedLine.includes('ます') && // 丁寧語を含む行は発言の可能性が高い
        !trimmedLine.includes('ありがとう') && // 挨拶を含む行は発言の可能性が高い
        !trimmedLine.includes('お願い') && // 挨拶を含む行は発言の可能性が高い
        !trimmedLine.includes('すみません') && // 挨拶を含む行は発言の可能性が高い
        !trimmedLine.includes('よろしく') && // 挨拶を含む行は発言の可能性が高い
        !trimmedLine.includes('CLアシスタント') && // システム名を除外
        trimmedLine.match(/^[^\s\d]+(?:\s+[^\s\d]+)*$/) && // 話者名のパターン
        trimmedLine.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/)) { // 日本語文字を含む（ひらがな、カタカナ、漢字）
      
      // 次の行が空行でない場合、話者名の可能性が高い
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.trim() && !nextLine.trim().match(/^[^\s\d]+(?:\s+[^\s\d]+)*$/)) {
        speakers.add(trimmedLine);
        console.log(`✅ 話者名検出: "${trimmedLine}" (行: ${i + 1})`);
      }
    }
    
    // パターン2.5: より柔軟な話者名検出（空行の後）
    if (trimmedLine && !speakers.has(trimmedLine)) {
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (prevLine === '' && 
          trimmedLine.match(/^[^\s\d]+(?:\s+[^\s\d]+)*$/) && 
          trimmedLine.length > 0 && trimmedLine.length < 50 &&
          !trimmedLine.includes('。') && !trimmedLine.includes('、') &&
          !trimmedLine.includes('です') && !trimmedLine.includes('ます') &&
          !trimmedLine.includes('会議タイトル:') && 
          !trimmedLine.includes('会議日時:') && 
          !trimmedLine.includes('参加者:') && 
          !trimmedLine.includes('文字起こし:') &&
          trimmedLine.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/)) {
        // 次の行に発言があるかチェック
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.trim() && !nextLine.trim().match(/^[^\s\d]+(?:\s+[^\s\d]+)*$/)) {
          speakers.add(trimmedLine);
          console.log(`✅ 話者名検出（パターン2.5）: "${trimmedLine}" (行: ${i + 1})`);
        }
      }
    }
  }
  
  // デバッグ用: 抽出された話者をログに出力
  console.log('=== 抽出された話者一覧 ===');
  console.log('話者数:', speakers.size);
  Array.from(speakers).forEach((speaker, index) => {
    console.log(`${index + 1}. ${speaker}`);
  });
  console.log('========================');
  
  return Array.from(speakers);
}

export function filterConversationData(conversationData: string, options: FilterOptions): FilterResult {
  const { excludeSpeakers = [], includeSpeakers = [], excludeKeywords = [] } = options;
  const lines = conversationData.split('\n');

  const isSpeakerLine = (line: string, nextLine: string | undefined): boolean => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return false;

    const hasTimestamp = /^([^\s\d]+(?:\s+[^\s\d]+)*)\s+\d{2}:\d{2}:\d{2}/.test(trimmedLine);
    if (hasTimestamp) return true;

    const isPotentialSpeaker =
      !trimmedLine.includes('会議タイトル:') &&
      !trimmedLine.includes('会議日時:') &&
      !trimmedLine.includes('参加者:') &&
      !trimmedLine.includes('文字起こし:') &&
      !trimmedLine.includes('=== ') &&
      !trimmedLine.match(/^\d{4}\/\d{2}\/\d{2}/) &&
      !trimmedLine.match(/^\d{2}:\d{2}/) &&
      trimmedLine.length > 0 &&
      trimmedLine.length < 50 &&
      !trimmedLine.includes('。') &&
      !trimmedLine.includes('、') &&
      !trimmedLine.includes('？') &&
      !trimmedLine.includes('！') &&
      !trimmedLine.includes('です') &&
      !trimmedLine.includes('ます') &&
      !trimmedLine.includes('ありがとう') &&
      !trimmedLine.includes('お願い') &&
      !trimmedLine.includes('すみません') &&
      !trimmedLine.includes('よろしく') &&
      !trimmedLine.includes('CLアシスタント') &&
      !!trimmedLine.match(/^[^\s\d]+(?:\s+[^\s\d]+)*$/) &&
      !!trimmedLine.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/);

    if (isPotentialSpeaker) {
      if (nextLine === undefined) return true;
      const trimmedNextLine = nextLine.trim();
      if (trimmedNextLine && !isSpeakerLine(nextLine, undefined)) {
        return true;
      }
      if (trimmedNextLine === '') return true;
    }
    
    return false;
  };

  type ConversationChunk = { speaker: string; lines: string[] };
  const chunks: ConversationChunk[] = [];
  let currentChunk: ConversationChunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : undefined;

    if (isSpeakerLine(line, nextLine)) {
      const speaker = line.trim().replace(/\s+\d{2}:\d{2}:\d{2}$/, '');
      currentChunk = { speaker, lines: [line] };
      chunks.push(currentChunk);
    } else {
      if (currentChunk) {
        currentChunk.lines.push(line);
      } else {
        if (chunks.length === 0) {
          chunks.push({ speaker: 'header', lines: [] });
        }
        chunks[0].lines.push(line);
      }
    }
  }

  const originalSpeakers = chunks.map(c => c.speaker).filter(s => s !== 'header');
  const includedSpeakerSet = new Set<string>();
  const excludedSpeakerSet = new Set<string>();
  const filteredLines: string[] = [];

  for (const chunk of chunks) {
    if (chunk.speaker === 'header') {
      filteredLines.push(...chunk.lines);
      continue;
    }

    const speaker = chunk.speaker;
    let shouldExclude = false;

    if (includeSpeakers.length > 0) {
      if (!includeSpeakers.some(inc => inc.replace(/\s/g, '') === speaker.replace(/\s/g, ''))) {
        shouldExclude = true;
      }
    }

    if (!shouldExclude && excludeSpeakers.length > 0) {
      if (excludeSpeakers.some(exc => exc.replace(/\s/g, '') === speaker.replace(/\s/g, ''))) {
        shouldExclude = true;
      }
    }

    if (shouldExclude) {
      excludedSpeakerSet.add(speaker);
    } else {
      filteredLines.push(...chunk.lines);
      includedSpeakerSet.add(speaker);
    }
  }
  
  const finalData = filteredLines.join('\n');
  const includedLines = finalData.split('\n').length;
  const excludedLines = conversationData.split('\n').length - includedLines;

  console.log('=== フィルタリング結果サマリー (チャンクベース) ===');
  console.log(`元の話者数: ${originalSpeakers.length}`);
  console.log(`除外された話者数: ${excludedSpeakerSet.size}`);
  console.log(`残った話者数: ${includedSpeakerSet.size}`);
  console.log(`除外された行数 (推定): ${excludedLines}`);
  console.log(`残った行数 (推定): ${includedLines}`);
  console.log(`除外された話者: ${Array.from(excludedSpeakerSet).join(', ') || 'なし'}`);
  console.log(`残った話者: ${Array.from(includedSpeakerSet).join(', ')}`);
  console.log('================================');

  return {
    filteredData: finalData,
    originalSpeakers,
    includedSpeakers: Array.from(includedSpeakerSet),
    excludedSpeakers: Array.from(excludedSpeakerSet),
    excludedLines,
    includedLines,
  };
}

/**
 * 特定の人の会話データを除外するためのデフォルトリスト（スペースなし）
 */
export const DEFAULT_EXCLUDE_SPEAKERS = [
  '榊原元気',
  '竹ノ内友樹',
  '岩橋恒平',
  '有馬祐輝',
  '山本新太',
  '愼幸恵',
  '金子友也',
  '川崎悠太朗',
  '古賀興志郎',
  '齊藤光輝',
  '多知直人',
  '飯塚広人',
  '儘田泰幸',
  '野坂実央',
  '佐藤直輝',
  '久保将輝',
  '土門和広',
  '田中舜也',
  '田頭弘喜',
  '大野群青',
  '瀬間さゆり',
  '高山裕基',
  '佐藤樹里',
  '西本尋太',
  '澤井大基',
  '米川諒',
  '中本新',
  '宮本美紗',
  '石井美亜',
  '奥澤裕人',
  '宇野裕紀',
  '前澤友彬',
  '門司真沙',
  '佐々木瑠太',
  '熊谷隆真',
  '斎藤麻理奈',
  '熊懐龍',
  '安元汐里',
  '深澤幹子',
  '渡邊真愛',
  '三笠啓',
  '仲西優太',
  '後田ゆうみ',
  '鵜池悠貴',
  '戸賀崎爽',
  '小林奈々実',
  '佐藤廉',
  '木間ひかる',
  '足達愉子',
  '宮澤由美',
  '藤岡亜里紗',
  '中野優香',
  '青山美愛',
  '髙橋佑汰',
  '岡本友博',
  '田崎勇佑',
  '髙橋早紀',
  '小池紗恵',
  '中柴拓海',
  '島村真利子',
  '加治佐健二',
  '黒田拓矢',
  '木田航平',
  '菅井壱太',
  '有本千華',
  '三浦和広',
  '磯村麗桜',
  '平塚駿',
  '西亮祐',
  '飯泉拓哉',
  '河本洋輝',
  '八島翼',
  '高橋拓人',
  '中内誉登',
  '渡辺光星',
  '中島汐梨',
  '坂口理佳子',
  '下田浩生',
  '後藤耕介',
  '木村亘太郎',
  '茂木淳史',
  '常盤未希',
  '小鷹実那子',
  '平田磨寛',
  '稲崎隆己',
  '大串英里奈',
  '山田基生',
  '八島愛',
  '渡部紗也加',
  '與川愛莉',
  '星隼太',
  '平木拓海',
  '室中花菜',
  '金詩温',
  '深谷咲来',
  '与那覇由妃',
  '高田雅也',
  '須藤良',
  '江口謙吾',
  '小西聡子',
  '畠山陸',
  '網本竣',
  '中軽米武',
  '渡邉洋樹',
  '奥成碧',
  '藤井徹平',
  '町山慎',
  '織口花菜子',
  '房野桃香',
  '稲川望咲',
  '坪川優里奈',
  '柏木和幸',
  '佐藤葵',
  '安井紳',
  '小川和貴',
  '永田勝',
  '石塚昌也',
  '杉山聖学',
  '大久保匡騎',
  '竹内汐菜',
  '伊藤慎太郎',
  '大久保悠雅',
  '楠康平',
  '清水天悠',
  '及川稜太',
  '田幡知城',
  '新井花林',
  '沼口雅樹',
  '寺尾賢太',
  '江森陽平',
  '古本光識',
  '老川仁美',
  '髙石真弘',
  '長谷川靖紘',
  '平野未紀',
  '田村采々未',
  '光田巧武',
  '鈴木風太',
  '安達圭佑',
  '荒井虎太郎',
  '渡辺拓登',
  '森谷太郎',
  '吉川颯哉',
  '小川俊治',
  '嶋田一成',
  '窪田寛己',
  '加納工',
  '佐藤優哉',
  '木代俊太郎',
  '中間洋彰',
  '森口寿気',
  '金城雄大',
  '柿本広人',
  '中村光太郎',
  '穴井玲菜',
  '黒田純矢',
  '杉本隼人',
  '小山田明人',
  '三浦真実',
  '村田純一',
  '髙澤史子',
  '片野鉄也',
  '永谷望那依',
  '菅原美咲',
  '松前大輝',
  '亀谷陸斗',
  '佐々木雄大',
  '倉知俊海',
  '柿沼航太',
  '坂口健太朗',
  '酒井美佑',
  '早田京右',
  '野間麗櫻',
  '佐々木準司',
  '齋藤健一郎',
  '高山竜馬',
  '篠本朔也',
  '田代耕平',
  '林広樹',
  '鈴木康一',
  '山中帝人',
  '矢嶋和明',
  '藤田将司',
  '松本龍弥',
  '粂海斗',
  '井口翔太',
  '長谷部成紀',
  '荒木将英',
  '柳沼利旺',
  '岩村穣太朗',
  '林田大雅',
  '加藤大季',
  '林勇太',
  '田代彩果',
  '石栗琢也',
  '高梨みゆ',
  '高野颯',
  '西尾圭史',
  '岡田晃卯健',
  '山崎恭平',
  '佐渡竜馬',
  '原弘樹',
  '山名駿一',
  '曽明洸太朗',
  '伊藤千桜',
  '山下実咲',
  '片山蒼介',
  '上馬場仁美',
  '村崎遥',
  '柳田純希',
  'CLアシスタント',
  '川合健太郎',
  '栗林ウブ',
  '髙橋拓人',
];

/**
 * 使用例のためのヘルパー関数
 */
export function createFilterOptions(excludeSpeakers?: string[]): FilterOptions {
  return {
    excludeSpeakers: excludeSpeakers || DEFAULT_EXCLUDE_SPEAKERS
  };
}