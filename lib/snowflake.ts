import snowflake from 'snowflake-sdk';

// Snowflake接続設定
const snowflakeConfig = {
  account: process.env.SNOWFLAKE_ACCOUNT || 'QOSKOKF-HY22175',
  username: process.env.SNOWFLAKE_USER || 'MASAKI',
  password: process.env.SNOWFLAKE_PASSWORD,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'SNOWFLAKE_LEARNING_WH',
  database: process.env.SNOWFLAKE_DATABASE || 'db',
  schema: process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
  role: process.env.SNOWFLAKE_ROLE || 'ACCOUNTADMIN',
};

// 接続プールを管理するクラス
class SnowflakeClient {
  private connection: any = null;

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.connection = snowflake.createConnection(snowflakeConfig);
      
      this.connection.connect((err: any, conn: any) => {
        if (err) {
          console.error('Snowflake connection error:', err);
          reject(err);
        } else {
          console.log('Successfully connected to Snowflake');
          resolve();
        }
      });
    });
  }

  async executeQuery(sqlText: string): Promise<any[]> {
    await this.connect();

    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText,
        complete: (err: any, stmt: any, rows: any[]) => {
          if (err) {
            console.error('Snowflake query error:', err);
            reject(err);
          } else {
            resolve(rows);
          }
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      return new Promise((resolve) => {
        this.connection.destroy((err: any) => {
          if (err) {
            console.error('Snowflake disconnect error:', err);
          }
          this.connection = null;
          resolve();
        });
      });
    }
  }
}

// シングルトンインスタンス
const snowflakeClient = new SnowflakeClient();

// 企業データ検索関数
export async function searchCompaniesInSnowflake(searchCriteria: {
  keywords?: string[];
  industry?: string;
  region?: string;
  tags?: string[];
  limit?: number;
}): Promise<any[]> {
  const { keywords = [], industry, region, limit = 50 } = searchCriteria;

  // 動的なWHERE句を構築
  const whereConditions: string[] = [];
  
  if (keywords.length > 0) {
    const keywordConditions = keywords.map(keyword => 
      `(UPPER(COMPANY_NAME) LIKE '%${keyword.toUpperCase()}%' OR 
        UPPER(BUSINESS_DESCRIPTION) LIKE '%${keyword.toUpperCase()}%' OR
        UPPER(BUSINESS_DESCRIPTION) LIKE '%${keyword.toUpperCase()}%')`
    );
    whereConditions.push(`(${keywordConditions.join(' OR ')})`);
  }

  if (industry) {
    whereConditions.push(`UPPER(INDUSTRY) LIKE '%${industry.toUpperCase()}%'`);
  }

  if (region) {
    whereConditions.push(`UPPER(REGION) LIKE '%${region.toUpperCase()}%'`);
  }



  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  const query = `
    SELECT 
      COMPANY_ID,
      COMPANY_NAME,
      INDUSTRY,
      BUSINESS_DESCRIPTION,

      REGION,
      PREFECTURE,

      EMPLOYEE_COUNT,
      INCORPORATION_DATE,
      OFFICIAL_WEBSITE
    FROM COMPANIES 
    ${whereClause}
    ORDER BY EMPLOYEE_COUNT DESC
    LIMIT ${limit}
  `;

  try {
    const results = await snowflakeClient.executeQuery(query);
    return results;
  } catch (error) {
    console.error('Error searching companies in Snowflake:', error);
    throw error;
  }
}

// 課題に基づくマッチング検索
export async function findSolutionCompanies(challengeKeywords: string[]): Promise<any[]> {
  console.log('=== findSolutionCompanies 開始 ===');
  console.log('入力課題キーワード:', challengeKeywords);
  
  // 課題キーワードに基づいて解決企業を検索
  const solutionKeywords = [
    ...challengeKeywords,
    'ソリューション', '解決', 'コンサルティング', 'サービス',
    'システム', 'AI', 'DX', '自動化', '効率化'
  ];
  
  console.log('検索用キーワード:', solutionKeywords);

  // まず全企業数を確認
  try {
    const totalQuery = `SELECT COUNT(*) as TOTAL_COUNT FROM COMPANIES`;
    const totalResult = await snowflakeClient.executeQuery(totalQuery);
    console.log(`データベース内の総企業数: ${totalResult[0]?.TOTAL_COUNT || 0}`);
  } catch (error) {
    console.error('総企業数の取得エラー:', error);
  }

  const results = await searchCompaniesInSnowflake({
    keywords: solutionKeywords,
    limit: 100
  });
  
  console.log(`検索結果: ${results.length}件の企業が見つかりました`);
  
  // 最初の3件の企業名をログ出力
  if (results.length > 0) {
    console.log('検索結果サンプル:');
    results.slice(0, 3).forEach((company, index) => {
      console.log(`${index + 1}. ${company.COMPANY_NAME}`);
    });
  } else {
    console.log('マッチする企業が見つかりませんでした');
  }
  
  console.log('=== findSolutionCompanies 終了 ===');
  
  return results;
}

// 企業の詳細情報を取得
export async function getCompanyDetails(companyId: string): Promise<any> {
  const query = `
    SELECT * FROM COMPANIES 
    WHERE COMPANY_ID = '${companyId}'
  `;

  try {
    const results = await snowflakeClient.executeQuery(query);
    return results[0] || null;
  } catch (error) {
    console.error('Error getting company details from Snowflake:', error);
    throw error;
  }
}

export { snowflakeClient };
