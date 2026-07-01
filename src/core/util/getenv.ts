
export function getEnvString(name: string, fallback: string): string;
export function getEnvString(name: string, fallback?: string): string | undefined;
export function getEnvString(name: string, fallback?: string): string | undefined {
    const value = process.env[name];
    return value === undefined || value === '' ? fallback : value;
}


export function getEnvInt(name: string, fallback: number): number;
export function getEnvInt(name: string, fallback?: number): number | undefined;
export function getEnvInt(name: string, fallback?: number): number | undefined {
    const raw = getEnvString(name);
    if (raw === undefined) return fallback;
    const value = Number.parseInt(raw, 10);
    return Number.isNaN(value) ? fallback : value;
}


export function getEnvDouble(name: string, fallback: number): number;
export function getEnvDouble(name: string, fallback?: number): number | undefined;
export function getEnvDouble(name: string, fallback?: number): number | undefined {
    const raw = getEnvString(name);
    if (raw === undefined) return fallback;
    const value = Number.parseFloat(raw);
    return Number.isNaN(value) ? fallback : value;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);


export function getEnvBool(name: string, fallback: boolean): boolean;
export function getEnvBool(name: string, fallback?: boolean): boolean | undefined;
export function getEnvBool(name: string, fallback?: boolean): boolean | undefined {
    const raw = getEnvString(name);
    if (raw === undefined) return fallback;

    const normalized = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    return fallback;
}

export function getEnvArray(name: string, fallback: string[], separator?: string): string[];
export function getEnvArray(name: string, fallback?: string[], separator?: string): string[] | undefined;
export function getEnvArray(name: string, fallback?: string[], separator: string = ','): string[] | undefined {
    const raw = getEnvString(name);
    if (raw === undefined) return fallback;

    const values = raw
        .split(separator)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    return values.length > 0 ? values : fallback;
}
