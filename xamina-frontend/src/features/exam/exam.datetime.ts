export function localDateTimeToUtcIso(value?: string | null): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return undefined;

    return `${parsed.toISOString().slice(0, 19)}Z`;
}

export function localDateTimePreview(value?: string | null): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toLocaleString();
}

export function dateToLocalDateTimeInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
}
