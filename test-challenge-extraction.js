// 課題抽出テスト用スクリプト
const sampleConversationData = `
【定例】SP：古川電気工業株式会社様｜

参加者: 田中社長、佐藤部長、山田主任

田中社長: 今日は、当社の現在の課題について話し合いましょう。まず、佐藤部長から現状報告をお願いします。

佐藤部長: はい、現在の課題を整理しました。まず、人材不足の問題があります。技術者の採用が難しく、特に若手エンジニアの確保が課題です。また、既存の技術者のスキルアップも必要です。

山田主任: 私からも追加で、システムの老朽化について報告します。現在使用している製造システムが10年以上前のもので、新しい技術に対応できていません。これにより、生産効率が低下し、競合他社との差が広がっています。

田中社長: なるほど、人材とシステムの両面で課題があるということですね。他には？

佐藤部長: はい、もう一つ重要な課題があります。顧客からの要望が多様化しており、従来の製品では対応できなくなっています。新しい製品開発が必要ですが、開発リソースが不足している状況です。

山田主任: また、品質管理の面でも課題があります。現在の検査システムでは、細かい品質チェックができず、不良品の流出リスクがあります。

田中社長: これらの課題を解決するために、どのような対策が必要でしょうか？

佐藤部長: まず、人材面では、採用活動の強化と社内研修の充実が必要です。システム面では、製造システムの更新と、新しい品質管理システムの導入を検討すべきです。

山田主任: 製品開発については、外部の技術パートナーとの連携も検討できると思います。
`;

const testData = {
  companyName: "古川電気工業株式会社",
  conversationData: sampleConversationData,
  sourceUrl: "https://docs.google.com/spreadsheets/d/test"
};

console.log('=== テストデータ ===');
console.log('企業名:', testData.companyName);
console.log('会話データ長:', testData.conversationData.length);
console.log('会話データ（最初の200文字）:', testData.conversationData.substring(0, 200));

// このデータを課題抽出APIに送信してテスト
async function testChallengeExtraction() {
  try {
    console.log('\n=== 課題抽出テスト開始 ===');
    
    const response = await fetch('http://localhost:3000/api/challenges/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    
    console.log('\n=== テスト結果 ===');
    console.log('Status:', response.status);
    console.log('Success:', result.success);
    
    if (result.success) {
      console.log('抽出された課題数:', result.extractedChallenges?.length || 0);
      console.log('課題分析:', JSON.stringify(result.challengeAnalysis, null, 2));
    } else {
      console.log('エラー:', result.error);
    }
    
  } catch (error) {
    console.error('テストエラー:', error);
  }
}

// テスト実行
testChallengeExtraction();
