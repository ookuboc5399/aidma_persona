

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
  
  for (const line of lines) {
    // 話者名とタイムスタンプのパターンをマッチ
    // 例: "高山竜馬 00:00:00" または "川原美穂 00:00:10"
    const match = line.match(/^([^\s\d]+(?:\s+[^\s\d]+)*)\s+\d{2}:\d{2}:\d{2}/);
    if (match) {
      speakers.add(match[1].trim());
    }
  }
  
  return Array.from(speakers);
}

/**
 * 会話データをフィルターする関数
 * @param conversationData 元の会話データ
 * @param options フィルターオプション
 * @returns フィルター済みの会話データと統計情報
 */
export function filterConversationData(conversationData: string, options: FilterOptions): FilterResult {
  const { excludeSpeakers = [], includeSpeakers = [], excludeKeywords = [] } = options;
  
  const lines = conversationData.split('\n');
  const filteredLines: string[] = [];
  
  const originalSpeakers = extractSpeakers(conversationData);
  const includedSpeakerSet: Set<string> = new Set();
  const excludedSpeakerSet: Set<string> = new Set();
  
  let excludedLines = 0;
  let includedLines = 0;
  let currentSpeaker: string | null = null;
  
  for (const line of lines) {
    let shouldExclude = false;
    
    const speakerMatch = line.match(/^([^\s\d]+(?:\s+[^\s\d]+)*)\s+\d{2}:\d{2}:\d{2}/);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1].trim();
    }

    if (currentSpeaker) {
      if (excludeSpeakers.length > 0) {
        const isExcluded = excludeSpeakers.some(excludedSpeaker => 
          currentSpeaker === excludedSpeaker || 
          currentSpeaker?.replace(/\s/g, '') === excludedSpeaker.replace(/\s/g, '')
        );
        if (isExcluded) {
          shouldExclude = true;
          excludedSpeakerSet.add(currentSpeaker);
        }
      }
      
      if (includeSpeakers.length > 0 && !shouldExclude) {
        const isIncluded = includeSpeakers.some(includedSpeaker => 
          currentSpeaker === includedSpeaker || 
          currentSpeaker?.replace(/\s/g, '') === includedSpeaker.replace(/\s/g, '')
        );
        if (!isIncluded) {
          shouldExclude = true;
        }
      }
    }
    
    if (!shouldExclude && excludeKeywords.length > 0) {
      const hasExcludedKeyword = excludeKeywords.some(keyword => 
        line.toLowerCase().includes(keyword.toLowerCase())
      );
      if (hasExcludedKeyword) {
        shouldExclude = true;
      }
    }
    
    if (!shouldExclude) {
      filteredLines.push(line);
      includedLines++;
      if (currentSpeaker) {
        includedSpeakerSet.add(currentSpeaker);
      }
    } else {
      excludedLines++;
    }
  }
  
  return {
    filteredData: filteredLines.join('\n'),
    originalSpeakers,
    includedSpeakers: Array.from(includedSpeakerSet),
    excludedSpeakers: Array.from(excludedSpeakerSet),
    excludedLines,
    includedLines
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
];

/**
 * 使用例のためのヘルパー関数
 */
export function createFilterOptions(excludeSpeakers?: string[]): FilterOptions {
  return {
    excludeSpeakers: excludeSpeakers || DEFAULT_EXCLUDE_SPEAKERS
  };
}
