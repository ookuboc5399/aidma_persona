import { NextRequest, NextResponse } from 'next/server';
import { filterConversationData, extractSpeakers } from '../../../../lib/conversation-filter';

export async function POST(req: NextRequest) {
  try {
    const testData = `高山竜馬 00:00:00
あのミーティングになってるので、主に商談の部分ですね、のご報告をいただければなというふうに思います。よろしくお願いします。

川原美穂 00:00:10
お願いします。

高山竜馬 00:00:11
すいません。少々お待ちください。ありがとうございます。一応前回の打ち合わせからで言うと、代理店さんが、こちらですね、東映広告さんからですかね。

川原美穂 00:00:27
ですね、投影広告さんが押し合わせに来なくてですね、`;

    console.log('=== 話者フィルターテスト開始 ===');

    // 1. 話者一覧の抽出
    const speakers = extractSpeakers(testData);
    console.log('話者一覧:', speakers);

    // 2. 高山竜馬を除外
    const filtered = filterConversationData(testData, { 
      excludeSpeakers: ['高山竜馬'] 
    });

    console.log('除外後の話者:', filtered.includedSpeakers);
    console.log('除外された話者:', filtered.excludedSpeakers);
    console.log('統計:', filtered.stats);

    return NextResponse.json({
      success: true,
      originalData: testData,
      speakers: speakers,
      filterResult: {
        originalSpeakers: filtered.originalSpeakers,
        includedSpeakers: filtered.includedSpeakers,
        excludedSpeakers: filtered.excludedSpeakers,
        stats: filtered.stats,
        filteredData: filtered.filteredData
      },
      test: {
        description: '高山竜馬の発言を除外するテスト',
        originalLength: testData.length,
        filteredLength: filtered.filteredData.length,
        reductionPercentage: Math.round((1 - filtered.filteredData.length / testData.length) * 100)
      }
    });

  } catch (error: unknown) {
    console.error('Speaker filter test error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    }, { status: 500 });
  }
}
