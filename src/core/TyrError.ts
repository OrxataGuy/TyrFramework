import { Logger, createLogger } from './Logger.js';

export class TyrError extends Error {
    public readonly originalError: unknown;
    public readonly isTyrError = true;
    public readonly suggestion?: string;
    public readonly commandName?: string;

    constructor(message: string, originalError?: unknown, suggestion?: string, commandName?: string) {
        super(message);
        this.originalError = originalError;
        this.suggestion = suggestion;
        this.commandName = commandName;
        Error.captureStackTrace(this, this.constructor);
    }

    private extractErrorMessage(err: unknown): string {
        if (err instanceof Error) return err.message;
        if (typeof err === 'string') return err;
        try {
            return JSON.stringify(err);
        } catch {
            return 'Unknown error (non-serializable)';
        }
    }

    public handle(isDebug: boolean = false, _logger?: Logger): void {
        const logger = _logger ?? createLogger(isDebug);

        if (this.commandName) {
            logger.error(`Error in command: ${this.commandName}`);
        }

        logger.error('Oops! An error occurred.');
        logger.error(`↳  ${this.message}`);

        if (this.originalError) {
            logger.error(`      ↳ Caused by: ${this.extractErrorMessage(this.originalError)}`);
        }

        if (this.suggestion) {
            logger.warn(`   Suggestion: ${this.suggestion}`);
        }

        if (isDebug) {
            if (this.originalError instanceof Error) {
                logger.log('\n--- Stack Trace ---');
                logger.log(this.originalError.stack);
            } else {
                logger.log('\n--- Stack Trace ---');
                logger.log(this);
            }
        } else {
            logger.log('\n(Use --debug to see the full stack trace)');
        }
    }
}
