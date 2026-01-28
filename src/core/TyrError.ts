export class TyrError extends Error {
    public readonly originalError: unknown;
    public readonly isTyrError = true;
    public readonly suggestion?: string;

    constructor(message: string, originalError?: unknown, suggestion?: string) {
        super(message);
        this.originalError = originalError;
        this.suggestion = suggestion;
        
        Error.captureStackTrace(this, this.constructor);
    }
}