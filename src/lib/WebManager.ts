import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';

import { Logger } from '../core/Logger.js';
import { TyrError } from '../core/TyrError.js';

/**
 * @class WebManager
 * @description Utilities for accessing APIs and the Internet.
 */
export class WebManager {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    private async fetch(url: string, config?: AxiosRequestConfig): Promise<cheerio.CheerioAPI> {
        try {
            const response: AxiosResponse<string> = await axios.get(url, config);
            return cheerio.load(response.data);
        } catch (e) {
            throw new TyrError(`Could not fetch URL: ${url}`, e, 'Check your internet connection and that the URL is valid.');
        }
    }

    /**
     * @method selectFromWeb
     * @description Selects elements from a web page using a CSS selector.
     * @param {string} url - URL of the page to scrape.
     * @param {Function} selector - CSS selector function.
     * @returns {Promise<string[]>} List of extracted text values.
     * @example
     * const titles = await web.selectFromWeb('https://example.com', ($) => $('h1'));
     */
    public async selectFromWeb(url: string, selector: ($: cheerio.CheerioAPI) => cheerio.Cheerio<any>): Promise<string[]> {
        try {
            const $ = await this.fetch(url);
            const results: string[] = [];
            const selection = selector($);

            if (typeof selection === 'string') return [selection];

            selection.each((_, element) => {
                const text = $(element).text().trim();
                if (text) results.push(text);
            });

            return results;
        } catch (e) {
            if (e instanceof TyrError) throw e;
            throw new TyrError(`Could not select content from: ${url}`, e);
        }
    }
}

export const WebManagerTests = {
    selectFromWeb: {
        url: 'https://www.w3schools.com/',
        selector: ($: any) => $('title'),
    },
};
