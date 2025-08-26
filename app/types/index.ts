// 共通の型定義

export interface Challenge {
  title: string;
  category: string;
  description: string;
  urgency: string;
  keywords: string[];
}

export interface CompanyInfo {
  company_name: string;
  industry: string;
  business_description: string;
  strengths: Array<{
    title: string;
    description: string;
    category: string;
  }>;
  business_tags: string[];
  original_tags: string[];
  region: string;
  prefecture: string;
}

export interface ChallengeAnalysis {
  challenges: Challenge[];
  summary: string;
}

export interface UnifiedExtractionResult {
  company_info: CompanyInfo;
  challenges: ChallengeAnalysis;
}

export interface MatchingResult {
  company_id: string | null;
  company_name: string;
  industry: string;
  business_description: string;
  strengths: string;
  region: string;
  prefecture: string;
  employee_count: number | string;
  match_score: number;
  match_reason: string;
  solution_details: string;
  advantages: string[];
  considerations: string[];
  implementation_timeline: string;
  estimated_cost: string;
}

export interface ProcessResult {
  success: boolean;
  companyName: string;
  extractedChallenges: string[];
  challenges: ChallengeAnalysis;
  companyInfo: CompanyInfo;
  matches: MatchingResult[];
  totalMatches: number;
  dataSource: string;
  matchingMethod: string;
  processingInfo?: {
    steps: string[];
    model: string;
  };
  error?: string;
}

export interface SnowflakeCompany {
  COMPANY_NAME: string;
  INDUSTRY: string;
  BUSINESS_DESCRIPTION: string;
  STRENGTHS: string;
  REGION: string;
  PREFECTURE: string;
  SOURCE_URL: string;
  CHALLENGES: string;
  PROCESSED_AT: string;
}
