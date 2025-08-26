/**
 * 会議タイトルから企業名を抽出する
 * @param meetingTitle 会議タイトル
 * @returns 抽出された企業名
 */
export function extractCompanyNameFromMeetingTitle(meetingTitle: string): string {
  if (!meetingTitle) return '';

  // パターン1: 【定例】SP：企業名様｜
  const pattern1 = /【定例】SP：(.+?)様/;
  const match1 = meetingTitle.match(pattern1);
  if (match1) {
    return match1[1].trim();
  }

  // パターン2: 企業名様｜
  const pattern2 = /(.+?)様/;
  const match2 = meetingTitle.match(pattern2);
  if (match2) {
    return match2[1].trim();
  }

  // パターン3: 企業名株式会社
  const pattern3 = /(.+?株式会社)/;
  const match3 = meetingTitle.match(pattern3);
  if (match3) {
    return match3[1].trim();
  }

  // パターン4: 企業名有限会社
  const pattern4 = /(.+?有限会社)/;
  const match4 = meetingTitle.match(pattern4);
  if (match4) {
    return match4[1].trim();
  }

  // デフォルト: タイトル全体を返す
  return meetingTitle.trim();
}

/**
 * 会議タイトルから企業名を抽出する（詳細版）
 * @param meetingTitle 会議タイトル
 * @returns 抽出結果の詳細
 */
export function extractCompanyNameDetailed(meetingTitle: string): {
  companyName: string;
  confidence: number;
  method: string;
} {
  if (!meetingTitle) {
    return { companyName: '', confidence: 0, method: 'empty' };
  }

  // パターン1: 【定例】SP：企業名様｜
  const pattern1 = /【定例】SP：(.+?)様/;
  const match1 = meetingTitle.match(pattern1);
  if (match1) {
    return {
      companyName: match1[1].trim(),
      confidence: 0.95,
      method: 'pattern1'
    };
  }

  // パターン2: 企業名様｜
  const pattern2 = /(.+?)様/;
  const match2 = meetingTitle.match(pattern2);
  if (match2) {
    return {
      companyName: match2[1].trim(),
      confidence: 0.8,
      method: 'pattern2'
    };
  }

  // パターン3: 企業名株式会社
  const pattern3 = /(.+?株式会社)/;
  const match3 = meetingTitle.match(pattern3);
  if (match3) {
    return {
      companyName: match3[1].trim(),
      confidence: 0.7,
      method: 'pattern3'
    };
  }

  // パターン4: 企業名有限会社
  const pattern4 = /(.+?有限会社)/;
  const match4 = meetingTitle.match(pattern4);
  if (match4) {
    return {
      companyName: match4[1].trim(),
      confidence: 0.7,
      method: 'pattern4'
    };
  }

  // デフォルト: タイトル全体を返す
  return {
    companyName: meetingTitle.trim(),
    confidence: 0.3,
    method: 'default'
  };
}
