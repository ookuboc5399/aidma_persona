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

  async executeQuery(sqlText: string, binds: any[] = []): Promise<any[]> {
    await this.connect();

    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText,
        binds,
        complete: (err: any, stmt: any, rows: any[]) => {
          if (err) {
            console.error('Snowflake query error:', err);
            reject(err);
          } else {
            // UPDATE文などの場合、rowsはundefinedになることがある
            resolve(rows || []);
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
  const binds: any[] = [];
  
  if (keywords.length > 0) {
    const keywordConditions = keywords.map(keyword => {
      const upperKeyword = `%${keyword.toUpperCase()}%`;
      binds.push(upperKeyword, upperKeyword);
      return `(UPPER(COMPANY_NAME) LIKE ? OR UPPER(BUSINESS_DESCRIPTION) LIKE ?)`;
    });
    whereConditions.push(`(${keywordConditions.join(' OR ')})`);
  }

  if (industry) {
    whereConditions.push(`UPPER(INDUSTRY) LIKE ?`);
    binds.push(`%${industry.toUpperCase()}%`);
  }

  if (region) {
    whereConditions.push(`UPPER(REGION) LIKE ?`);
    binds.push(`%${region.toUpperCase()}%`);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  binds.push(limit);

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
    LIMIT ?
  `;

  try {
    const results = await snowflakeClient.executeQuery(query, binds);
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
    WHERE COMPANY_ID = ?
  `;

  try {
    const results = await snowflakeClient.executeQuery(query, [companyId]);
    return results[0] || null;
  } catch (error) {
    console.error('Error getting company details from Snowflake:', error);
    throw error;
  }
}

/**
 * 企業のコンサルタント情報を更新する
 * @param companyName 対象の企業名
 * @param consultantNames コンサルタント名のリスト
 */
export async function updateCompanyConsultant(companyName: string, consultantNames: string[]): Promise<void> {
  if (!companyName) {
    console.warn('企業名が指定されていないため、コンサルタント情報の更新をスキップします。');
    return;
  }
  if (consultantNames.length === 0) {
    console.log(`企業「${companyName}」の更新対象コンサルタントがいないため、処理をスキップします。`);
    return;
  }

  const consultantsString = consultantNames.join(', ');

  const query = `
    UPDATE COMPANIES
    SET CONSULTANT_NAME = ?
    WHERE COMPANY_NAME = ?
  `;

  try {
    await snowflakeClient.executeQuery(query, [consultantsString, companyName]);
    console.log(`✅ 企業「${companyName}」のコンサルタント情報を更新しました: ${consultantsString}`);
  } catch (error) {
    console.error(`❌ 企業「${companyName}」のコンサルタント情報更新中にエラーが発生しました:`, error);
    throw error;
  }
}

export { snowflakeClient };
