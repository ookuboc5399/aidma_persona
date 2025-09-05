import { NextRequest, NextResponse } from 'next/server';
import { filterConversationData, extractSpeakers } from '../../../../lib/conversation-filter';

export async function POST(req: NextRequest) {
  try {
    const testData = `会議タイトル: 【定例】SP：株式会社ホーキング様｜引継ぎ挨拶
会議日時: 2025/08/18（月）16:00 - 17:00
参加者: CLアシスタント, 中柴拓海, 長谷部成紀, 宮岡ホーキング, 青山美愛, 松前大輝

文字起こし:

宮岡ホーキング
聞こえますか。聞こえます。

長谷部成紀
すいません。はい。よろしくお願いいたします。顔映ってないですね。皆さん。あれ本当ですか。私達は映ってて宮岡さんの顔も映ってるんですが、こっちが見えない。もしかしたら御社側かもしれないのと、抜けちゃいましたね。

あれ抜けましたよね、僕だけ

抜けられました。また、再度入られますかね。お願いします。今顔映ってますかね。映ってます。はい。よかったです。はい

宮岡ホーキング
はい聞こえてます。今、隣に仕事はおりますが、ちょっと仕事が継続されてますので、参加はできます。はい。わかりましたありがとうございます。

長谷部成紀
よろしくお願いします。よろしくお願いいたします。はい。そしたら今日活動のところいつから始めていくのかだったりとか何を始めていくのかってお話でぜひ御社側からお伺いできればなと思って会議、`;

    console.log('=== 改善された話者フィルターテスト開始 ===');

    // 1. 話者一覧の抽出
    const speakers = extractSpeakers(testData);
    console.log('話者一覧:', speakers);

    // 2. includeSpeakersに宮岡ホーキングと長谷部成紀を指定し、長谷部成紀を除外
    const filtered = filterConversationData(testData, { 
      includeSpeakers: ['宮岡ホーキング', '長谷部成紀'],
      excludeSpeakers: ['長谷部成紀'] 
    });

    console.log('除外後の話者:', filtered.includedSpeakers);
    console.log('除外された話者:', filtered.excludedSpeakers);
    console.log('除外された発言数:', filtered.excludedLines);
    console.log('残った発言数:', filtered.includedLines);

    return NextResponse.json({
      success: true,
      originalData: testData,
      speakers: speakers,
      filterResult: {
        originalSpeakers: filtered.originalSpeakers,
        includedSpeakers: filtered.includedSpeakers,
        excludedSpeakers: filtered.excludedSpeakers,
        excludedLines: filtered.excludedLines,
        includedLines: filtered.includedLines,
        filteredData: filtered.filteredData
      },
      test: {
        description: 'includeSpeakersからexcludeSpeakersを除外するテスト（空白行対応改善版）',
        originalLength: testData.length,
        filteredLength: filtered.filteredData.length,
        reductionPercentage: Math.round((1 - filtered.filteredData.length / testData.length) * 100)
      }
    });

  } catch (error: unknown) {
    console.error('Improved speaker filter test error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    }, { status: 500 });
  }
}
