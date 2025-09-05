import { NextRequest, NextResponse } from 'next/server';
import { extractSpeakers } from '../../../../lib/conversation-filter';

export async function POST(req: NextRequest) {
  try {
    const simpleTestData = `宮岡ホーキング
聞こえますか。聞こえます。

長谷部成紀
すいません。はい。よろしくお願いいたします。

宮岡ホーキング
はい聞こえてます。`;

    console.log('=== シンプル話者検出テスト ===');
    console.log('テストデータ:');
    console.log(simpleTestData);
    console.log('========================');

    const speakers = extractSpeakers(simpleTestData);

    return NextResponse.json({
      success: true,
      testData: simpleTestData,
      speakers: speakers,
      speakerCount: speakers.length
    });

  } catch (error: unknown) {
    console.error('Simple speaker test error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    }, { status: 500 });
  }
}
