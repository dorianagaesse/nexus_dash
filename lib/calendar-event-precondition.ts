/** A single strong provider ETag, never a wildcard or an ETag list. */
export function isCalendarEventEtag(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 &&
    /^"[\x21\x23-\x7e\x80-\xff]+"$/.test(value);
}
