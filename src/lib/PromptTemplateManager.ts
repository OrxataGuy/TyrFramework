import { AIContextManager } from './AIContextManager.js';
import { AIMessage } from './AIVendorManager.js';
import { Logger } from '../core/Logger.js';
import { TyrError } from '../core/TyrError.js';

export interface PromptTemplate {
    system: string;
    user: string;
}

const DEFAULT_TEMPLATES: Record<string, PromptTemplate> = {
    'analyze-bug': {
        system:
            'You are a senior software engineer specialised in debugging. Analyse the given code and ' +
            'describe the root cause of the bug, then propose a minimal, correct fix. Be precise and ' +
            'reference exact lines when possible.',
        user: 'Bug description:\n{{description}}\n\nRelevant code:\n```\n{{code}}\n```',
    },
    'generate-command': {
        system:
            'You are a senior TypeScript engineer generating a Tyr Framework command. Follow the ' +
            'existing conventions exactly: dependency injection via TyrContext, TyrError for failures, ' +
            'JSDoc comments on public methods. Output only the TypeScript code for the file, no commentary.',
        user: 'Command name: {{name}}\nRequested behaviour:\n{{description}}',
    },
    'generate-code': {
        system:
            'You are a senior engineer. Follow the ' +
            'existing conventions exactly: KISS, SOLID, DRY. Only make simple comments on the functions to give context if is necessary ' +
            'Output only the code for the file, no commentary.',
        user: 'Command name: {{name}}\nRequested behaviour:\n{{description}}',
    },
    'explain-code': {
        system:
            'You are a senior software engineer. Explain what the given code does clearly and ' +
            'concisely, for a developer unfamiliar with it.',
        user: 'Code:\n```\n{{code}}\n```',
    },
    'refactor-code': {
        system:
            'You are a senior software engineer. Refactor the given code for clarity and ' +
            'maintainability without changing its behaviour. Explain the key changes briefly, then ' +
            'provide the full refactored code.',
        user: 'Code:\n```\n{{code}}\n```\n\nGoal:\n{{goal}}',
    },
};

/**
 * @class PromptTemplateManager
 * @description Manages the system's prompt templates. Exposes a base template for common tasks
 * (analysing a bug, generating a command, explaining or refactoring code) and fills in the
 * placeholders with the user's code and the project context, so the AI always receives its role
 * instructions in a uniform way.
 */
export class PromptTemplateManager {
    private context: AIContextManager;
    private logger: Logger;
    private templates: Record<string, PromptTemplate>;

    constructor(context: AIContextManager, logger: Logger) {
        this.context = context;
        this.logger = logger;
        this.templates = { ...DEFAULT_TEMPLATES };
    }

    /**
     * @method listTemplates
     * @description Lists the names of all registered prompt templates.
     * @returns {string[]} Template names.
     * @example
     * const names = prompts.listTemplates();
     * // ['analyze-bug', 'generate-command', 'explain-code', 'refactor-code']
     */
    public listTemplates(): string[] {
        return Object.keys(this.templates);
    }

    /**
     * @method registerTemplate
     * @description Registers a new prompt template, or overrides an existing one.
     * @param {string} name - Unique template name.
     * @param {PromptTemplate} template - The system role instructions and the user template string.
     * @example
     * prompts.registerTemplate('write-tests', {
     *   system: 'You are a senior QA engineer...',
     *   user: 'Code:\n```\n{{code}}\n```',
     * });
     */
    public registerTemplate(name: string, template: PromptTemplate): void {
        this.templates[name] = template;
    }

    private fill(template: string, vars: Record<string, string>): string {
        return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key: string) => {
            if (!(key in vars)) {
                throw new TyrError(
                    `Missing placeholder value: '${key}'`,
                    null,
                    `Provide a value for '${key}' when building this prompt.`
                );
            }
            return vars[key];
        });
    }

    /**
     * @method build
     * @description Fills a named template with the given variables and prepends the project's
     * context (see AIContextManager), producing the full list of messages ready to send to
     * AIVendorManager.
     * @param {string} templateName - Name of a registered template (see listTemplates()).
     * @param {Record<string,string>} vars - Values for the template's {{placeholders}}.
     * @param {string} projectDir - Absolute path to the project root, used to load its context.
     * @returns {Promise<AIMessage[]>} Ordered messages: [system, ...context, user].
     * @example
     * const messages = await prompts.build('analyze-bug', {
     *   description: 'Login fails with a 500 error',
     *   code: fileContent,
     * }, process.cwd());
     * const result = await ai.complete(messages);
     */
    public async build(templateName: string, vars: Record<string, string>, projectDir: string): Promise<AIMessage[]> {
        const template = this.templates[templateName];
        if (!template) {
            throw new TyrError(
                `Unknown prompt template: '${templateName}'`,
                null,
                `Available templates: ${this.listTemplates().join(', ')}`
            );
        }

        const systemMessage: AIMessage = { role: 'system', content: template.system };
        const userMessage: AIMessage = { role: 'user', content: this.fill(template.user, vars) };
        const contextMessages = await this.context.getContext(projectDir);

        return [systemMessage, ...contextMessages, userMessage];
    }
}

export const PromptTemplateManagerTests = {
    listTemplates: {},
};
