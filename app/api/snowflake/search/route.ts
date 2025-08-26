import { NextRequest, NextResponse } from 'next/server';
import { searchCompaniesInSnowflake, findSolutionCompanies } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    const { searchType, criteria } = await req.json();

    if (!searchType) {
      return NextResponse.json(
        { error: 'Search type is required (general or solution)' },
        { status: 400 }
      );
    }

    let results = [];

    switch (searchType) {
      case 'general':
        // 一般的な企業検索
        results = await searchCompaniesInSnowflake(criteria);
        break;

      case 'solution':
        // 課題解決企業の検索
        const { challengeKeywords } = criteria;
        if (!challengeKeywords || challengeKeywords.length === 0) {
          return NextResponse.json(
            { error: 'Challenge keywords are required for solution search' },
            { status: 400 }
          );
        }
        results = await findSolutionCompanies(challengeKeywords);
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid search type. Use "general" or "solution"' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      searchType,
      criteria,
      totalResults: results.length,
      companies: results,
    });

  } catch (error: unknown) {
    console.error('Snowflake search error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Snowflake search failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
