import { Logger } from '../core/Container.js';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';

/**
 * @class WebManager
 * @description Utilidades para acceso a APIs e Internet.
 */
export class WebManager {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    private async get(url: string, config?: AxiosRequestConfig): Promise<cheerio.CheerioAPI> {
        try {
            const response: AxiosResponse<string> = await axios.get(url, config);
            const html = response.data;
            return cheerio.load(html);
        } catch (error) {
            this.logger.error(`Error fetching HTML from ${url}: ${error}`);
            throw error;
        }
    }

    /**
   * @method selectFromWeb
   * @description Selecciona elementos de una página web usando un selector CSS.
   * @param {string | URL} url - URL o string para extraer hostname.
   * @param {string} selector - Selector CSS para identificar elementos.
   * @returns {Promise<string[]>} Lista de textos extraídos.
   * @example
   * const title = await web.selectFromWeb('https://example.com', ($) => $('title').text());
   */
    public async selectFromWeb(url: string, selector: ($: cheerio.CheerioAPI) => cheerio.Cheerio<any>): Promise<string[]> {
        try {
            const $ = await this.get(url);
            const results: string[] = [];
            const selection = selector($);

            if(typeof selection === 'string') {
                return selection;
            }
           
            selection.each((_, element) => {
                results.push(element.trim());
            });
            return results;
        } catch (error) {
            this.logger.error(`Error selecting from web ${url} with selector ${selector}: ${error}`);
            throw error;
        }
    }

}

/**
 * @object WebManagerTests
 * @description Parámetros de pruebas para validar la funcionalidad de WebManager.
 */
export const WebManagerTests = {
    selectFromWeb: {
        url: 'https://www.w3schools.com/',
        selector: ($: any) => $('title').text()
    }
};