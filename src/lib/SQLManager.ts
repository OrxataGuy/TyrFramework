import path from 'path';
import sql, { config as SQLConfig } from 'mssql';

/**
 * @class SQLManager
 * @description SQL Server database connector.
 */
export class SQLManager {
  private pool!: sql.ConnectionPool;
  private connected = false;

  constructor() {
  }

  private async init(): Promise<void> {
    if (!this.connected) {

      const db_config: SQLConfig = {
        user: process.env.MSSQL_USER,
        password: process.env.MSSQL_PASSWORD,
        server: process.env.MSSQL_SERVER || '',
        database: process.env.MSSQL_DATABASE,
        options: {
          encrypt: false,
          trustServerCertificate: true
        }
      };

      this.pool = await sql.connect(db_config);
      this.connected = true;
    }
  }

  /**
   * @method select
   * @description Executes a SELECT command on SQL Server and returns the result as JSON.
   * @param {string} query - The full SELECT command.
   * @returns {Promise<any[]>} The result records.
   * @example
   * await dbManager.init();
   * const data = await dbManager.select('SELECT * FROM table');
   */
  public async select(query: string): Promise<any[]> {
    await this.init();

    const result = await this.pool.request().query(query);

    await this.close();
    return result.recordset;
  }

  /**
   * @method searchBrokerOnDB
   * @description Looks up a broker by hostname using the encoded query.
   * @param {string | URL} url - URL or string to extract the hostname from.
   * @returns {Promise<string>} Broker name.
   * @example
   * const broker = await db.searchBrokerOnDB('https://www.foo.com');
   */
  public async searchBrokerOnDB(url: string | URL): Promise<string> {
    let urlString = url.toString();

    if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
      urlString = "https://" + urlString;
    }
    let urlObj = new URL(urlString).hostname;

    if (urlObj.split('.').length < 3) {
      urlObj = ['www', urlObj].join('.');
    }

    const isWeb = urlObj.startsWith('www') ||
      urlObj.startsWith('horizon') ||
      urlObj.startsWith('ambiance') ||
      urlObj.startsWith('panorama') ||
      urlObj.startsWith('flow') ||
      urlObj.startsWith('panorama') ||
      urlObj.startsWith('avantio') ||
      urlObj.startsWith('demo');


    const query = isWeb ? `SELECT basedir as BROKER from ftpUsers where CONCAT(prefijo, '.', dominio) = '${urlObj}'` : `SELECT LOGIN_DS AS BROKER from CR_CANALVENTAS WHERE WEB_DS = '${urlObj}'`;

    await this.init();

    const result = await this.pool.request().query(query);

    await this.close();

    if (!result.recordset[0] || !result.recordset[0].BROKER) {
      throw new Error(`No broker found for ${urlObj}`);
    }

    return result.recordset[0].BROKER as string;
  }

  private async close(): Promise<void> {
    if (this.connected && this.pool) {
      await this.pool.close();
      this.connected = false;
    }
  }
}

/**
 * @object SQLManagerTests
 * @description Test parameters to validate SQLManager functionality.
 */
export const SQLManagerTests = {
    // init: {},
    // select: { query: 'SELECT 1 as test_value' },
    // connectionPool: { queries: ['SELECT 1 as q1', 'SELECT 2 as q2', 'SELECT 3 as q3'] }
};