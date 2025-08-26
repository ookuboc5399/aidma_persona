import { NextRequest, NextResponse } from 'next/server';
import { snowflakeClient } from '../../../../lib/snowflake';

export async function POST(req: NextRequest) {
  try {
    const { companyName, sourceUrl, challenges, companyInfo } = await req.json();

    if (!companyName || !sourceUrl) {
      return NextResponse.json(
        { error: 'Company name and source URL are required' },
        { status: 400 }
      );
    }

    console.log('=== Snowflake Store Start ===');
    console.log(`Company: ${companyName}`);
    console.log(`Source URL: ${sourceUrl}`);
    console.log(`Storing to COMPANIES table with unified extraction data`);

    // 重複チェック
    console.log('\n=== Checking for duplicate company name ===');
    const duplicateCheckQuery = `
      SELECT COUNT(*) as count
      FROM COMPANIES 
      WHERE COMPANY_NAME = '${companyName.replace(/'/g, "''")}'
    `;

    const duplicateResult = await snowflakeClient.executeQuery(duplicateCheckQuery);
    const existingCount = duplicateResult[0]?.count || 0;

    if (existingCount > 0) {
      console.log(`⚠️ 企業名 "${companyName}" は既に存在します（${existingCount}件）`);
      return NextResponse.json({
        success: false,
        message: `企業名 "${companyName}" は既にデータベースに存在します`,
        existingCount,
        companyName
      }, { status: 409 }); // Conflict status
    }

    console.log(`✅ 企業名 "${companyName}" は重複していません`);

    // 保存するデータの詳細をログ出力
    console.log('\n=== Data to be stored in Snowflake ===');
    console.log('Company Name:', companyName);
    console.log('Source URL:', sourceUrl);
    console.log('Company Info:', JSON.stringify(companyInfo, null, 2));
    console.log('Challenges:', JSON.stringify(challenges, null, 2));
    console.log('=== End of data to be stored ===\n');

    // COMPANIESテーブルに企業情報と課題分析を格納
    const insertQuery = `
      INSERT INTO COMPANIES (
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        STRENGTHS,
        REGION,
        PREFECTURE,
        SOURCE_URL,
        CHALLENGES,
        PROCESSED_AT
      ) VALUES (
        '${companyName.replace(/'/g, "''")}',
        '${(companyInfo?.industry || '').replace(/'/g, "''")}',
        '${(companyInfo?.business_description || '').replace(/'/g, "''")}',
        '${JSON.stringify(companyInfo?.strengths || []).replace(/'/g, "''")}',
        '${(companyInfo?.region || '').replace(/'/g, "''")}',
        '${(companyInfo?.prefecture || '').replace(/'/g, "''")}',
        '${sourceUrl || ''}',
        '${JSON.stringify(challenges?.challenges || []).replace(/'/g, "''")}',
        CURRENT_TIMESTAMP()
      )
    `;

    await snowflakeClient.executeQuery(insertQuery);

    // 保存後の確認クエリ
    const verifyQuery = `
      SELECT 
        COMPANY_NAME,
        INDUSTRY,
        BUSINESS_DESCRIPTION,
        STRENGTHS,
        REGION,
        PREFECTURE,
        SOURCE_URL,
        CHALLENGES,
        PROCESSED_AT
      FROM COMPANIES 
      WHERE COMPANY_NAME = '${companyName.replace(/'/g, "''")}'
      ORDER BY PROCESSED_AT DESC 
      LIMIT 1
    `;

    const verifyResult = await snowflakeClient.executeQuery(verifyQuery);
    console.log('\n=== Verification: Data stored in Snowflake ===');
    console.log('Stored Data:', JSON.stringify(verifyResult[0], null, 2));
    console.log('=== End of verification ===\n');

    return NextResponse.json({
      success: true,
      message: 'Company information and challenges stored in COMPANIES table successfully',
      storedData: verifyResult[0]
    });

  } catch (error: unknown) {
    console.error('Snowflake store error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to store in Snowflake: ${errorMessage}` },
      { status: 500 }
    );
  }
}
