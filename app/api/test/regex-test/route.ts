import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const testNames = ['宮岡ホーキング', '長谷部成紀', '聞こえますか。聞こえます。', 'すいません。はい。よろしくお願いいたします。'];
    
    const results = testNames.map(name => {
      const pattern = /^[^\s\d]+(?:\s+[^\s\d]+)*$/;
      const matches = pattern.test(name);
      
      return {
        name,
        matches,
        length: name.length,
        hasPeriod: name.includes('。'),
        hasComma: name.includes('、'),
        hasDesu: name.includes('です'),
        hasMasu: name.includes('ます'),
        hasArigato: name.includes('ありがとう'),
        hasOnegai: name.includes('お願い'),
        hasSumimasen: name.includes('すみません'),
        hasYoroshiku: name.includes('よろしく')
      };
    });

    return NextResponse.json({
      success: true,
      testResults: results
    });

  } catch (error: unknown) {
    console.error('Regex test error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    }, { status: 500 });
  }
}
