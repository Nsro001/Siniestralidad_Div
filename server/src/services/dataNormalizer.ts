
export const normalizeClientName = (name: string): string => {
    if (!name) return "";
    return name.trim().replace(/\s+/g, ' ');
};

export const normalizeDate = (value: string | number): string => {
    // If Excel number (serial date) requires handling, or string format
    // SheetJS often parses dates to numbers or strings depending on options.
    // We will assume string input like "DD-MM-YYYY" or "YYYY-MM" or "MM-YYYY" or Excel Serial.

    // Implementation note: We will handle common formats.
    // Ideally, the caller passes a string or Date.

    // For this MVP, we will try to parse robustly.
    if (!value) return "";

    let date: Date | null = null;

    if (typeof value === 'number') {
        // Excel serial date roughly (adjust for leap years/mac if rigorous, but basic is:)
        // JS Date is from 1970. Excel is from 1900.
        // 25569 is diff between 1970 and 1900.
        date = new Date((value - 25569) * 86400 * 1000);
    } else if (typeof value === 'string') {
        // Try Text formats
        const parts = value.split(/[-/]/);
        if (parts.length === 3) {
            // Detect DD-MM-YYYY vs YYYY-MM-DD
            // If first part > 1900, assume YYYY-MM-DD
            if (parseInt(parts[0]) > 1900) {
                date = new Date(value);
            } else {
                // Assume DD-MM-YYYY
                // new Date("MM-DD-YYYY") is standard in JS
                date = new Date(`${parts[1]}-${parts[0]}-${parts[2]}`);
            }
        } else {
            date = new Date(value);
        }
    }

    if (date && !isNaN(date.getTime())) {
        const yyyy = date.getFullYear();
        const mm = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${yyyy}-${mm}`;
    }
    return String(value); // Fallback: return as is if parse fails
};

export const COVERAGE_MAPPING: Record<string, string> = {
    "203": "Salud",
    // Add other known codes here if provided, or mapped dynamically
    // User example: 203 -> Salud.
    // We need mapping for Dental, Catastrophic, Vida if they have codes.
    // For now we default to Unknown if not found, or pass through valid names.
};

export const normalizeCoverage = (input: string | number): string => {
    const code = String(input).trim();

    if (COVERAGE_MAPPING[code]) {
        return COVERAGE_MAPPING[code];
    }

    // If it's already a text matching our expected categories (Case insensitive)
    const lower = code.toLowerCase();
    if (lower.includes("salud")) return "Salud";
    if (lower.includes("dental")) return "Dental";
    if (lower.includes("catast") || lower.includes("catást")) return "Catastrófico";
    if (lower.includes("vida")) return "Vida";

    return "Desconocida";
};

export const normalizeCurrency = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const cleaned = val.replace(',', '.').replace(/[^0-9.-]/g, '');
        return parseFloat(cleaned) || 0;
    }
    return 0;
};
