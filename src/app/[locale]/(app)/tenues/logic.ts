// Shapes of the outfits API as the screens use them + pure helpers (client-safe: no server import; unit tested in tests/ui/outfits.test.tsx).
import type { IconName } from '@/ui/components/Icon';

// Mirror of src/modules/outfits/domain/roles.ts (the module index pulls Prisma, so it cannot be imported by client code).
export const ROLES = ['TOP', 'BOTTOM', 'ONE_PIECE', 'OUTERWEAR', 'SHOES', 'ACCESSORY', 'OTHER'] as const;
export type Role = (typeof ROLES)[number];
export type OutfitStatus = 'DRAFT' | 'PLANNED' | 'WORN' | 'CANCELLED';

export type Item = { garmentId: string; role: Role; position: number };
export type Warning = { code: 'MISSING_ROLE' | 'GARMENT_UNAVAILABLE' | 'GARMENT_TRASHED'; role?: string; garmentId?: string; status?: string };
export type Outfit = {
  id: string;
  title: string | null;
  status: OutfitStatus;
  occasion: string | null;
  startsAt: string | null;
  endsAt: string | null;
  localDate: string | null;
  localTime: string | null;
  timezone: string | null;
  items: Item[];
  activeWearRecordId: string | null;
  version: number;
  warnings?: Warning[];
};
export type Snapshot = { nickname: string | null; categoryCode: string; subtypeCode: string | null; customSubtypeLabel: string | null; primaryColorCode: string; extraColorCodes: string[] };
export type WearRecord = {
  id: string;
  outfitId: string;
  title: string | null;
  occasion: string | null;
  status: 'ACTIVE' | 'INVALIDATED';
  confirmedAt: string;
  localDate: string;
  localTime: string;
  timezone: string;
  items: { garmentId: string | null; role: Role; position: number; snapshot: Snapshot }[];
  version: number;
};
export type Conflict = { kind: 'OVERLAP_CERTAIN' | 'OVERLAP_POSSIBLE' | 'GARMENT_UNAVAILABLE' | 'GARMENT_TRASHED'; garmentId: string; otherOutfitId?: string; status?: string; suggestions: string[] };
export type WashResult = {
  wearRecordId: string;
  marked: string[];
  skipped: { garmentId: string; status: string; reason: 'NOT_AVAILABLE' }[];
  failed: { garmentId: string; code: string }[];
};
export type Template = { id: string; name: string; occasion: string | null; items: Item[]; version: number };

// Text + icon + colour for each outfit status: colour is never the only cue.
export const OUTFIT_LOOK: Record<OutfitStatus, { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; icon: IconName }> = {
  DRAFT: { tone: 'neutral', icon: 'edit' },
  PLANNED: { tone: 'info', icon: 'clock' },
  WORN: { tone: 'success', icon: 'check' },
  CANCELLED: { tone: 'danger', icon: 'close' },
};

export const isEditable = (s: OutfitStatus) => s === 'DRAFT' || s === 'PLANNED';

/** Same rule as the server: a ONE_PIECE, or TOP + BOTTOM; plus SHOES. Advisory only. */
export function missingRoles(present: readonly string[]): Role[] {
  const has = new Set(present);
  const out: Role[] = [];
  if (!has.has('ONE_PIECE')) {
    if (!has.has('TOP')) out.push('TOP');
    if (!has.has('BOTTOM')) out.push('BOTTOM');
  }
  if (!has.has('SHOES')) out.push('SHOES');
  return out;
}

const CATEGORY_ROLE: Record<string, Role> = {
  TOPS: 'TOP', KNITWEAR: 'TOP', BOTTOMS: 'BOTTOM', ONE_PIECE: 'ONE_PIECE', OUTERWEAR: 'OUTERWEAR', FOOTWEAR: 'SHOES', ACCESSORIES: 'ACCESSORY', BAGS: 'ACCESSORY',
};
/** Default role of a garment picked from the wardrobe (editable afterwards). */
export const roleForCategory = (categoryCode: string): Role => CATEGORY_ROLE[categoryCode] ?? 'OTHER';

// ---------------------------------------------------------------- dates (YYYY-MM-DD strings, computed in UTC to stay zone-free)
const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => ymd(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000));
export const isDate = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
/** Monday..Sunday of the week holding `date`. */
export function weekOf(date: string): string[] {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(date, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function parts(t: number, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export const todayIn = (timeZone: string, now = Date.now()) => parts(now, timeZone).date;
/** Wall-clock date and time of an instant in a zone. */
export const wallClock = (iso: string, timeZone: string) => parts(Date.parse(iso), timeZone);

/** ISO instant of a wall-clock date + time in an IANA zone (two passes settle DST offsets). */
export function zonedInstant(date: string, time: string, timeZone: string): string {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offset = (t: number) => {
    const p = parts(t, timeZone);
    return Date.parse(`${p.date}T${p.time}:00Z`) - Math.floor(t / 60_000) * 60_000;
  };
  let t = wall - offset(wall);
  t = wall - offset(t);
  return new Date(t).toISOString();
}

/** Outfits of a range, grouped by local date in chronological order (each day: by start). */
export function groupByDay(outfits: Outfit[], days: string[]): { date: string; outfits: Outfit[] }[] {
  return days.map((date) => ({
    date,
    outfits: outfits.filter((o) => o.localDate === date).sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.id.localeCompare(b.id)),
  }));
}

// ---------------------------------------------------------------- editor form
export type ScheduleForm = { title: string; occasion: string; date: string; start: string; end: string; timezone: string };
export type ScheduleError = 'startRequired' | 'dateRequired';

export function formOf(o: Outfit | null, timezone: string, date = ''): ScheduleForm {
  const tz = o?.timezone ?? timezone;
  return {
    title: o?.title ?? '',
    occasion: o?.occasion ?? '',
    date: o?.localDate ?? date,
    start: o?.localTime ?? '',
    end: o?.endsAt ? wallClock(o.endsAt, tz).time : '',
    timezone: tz,
  };
}

export function checkSchedule(f: ScheduleForm): Partial<Record<'date' | 'start', ScheduleError>> {
  if (f.date && !f.start) return { start: 'startRequired' };
  if (!f.date && (f.start || f.end)) return { date: 'dateRequired' };
  return {};
}

/** PATCH / POST body of the schedule fields (every field explicit so an edit can also clear one). An end before the start is the next day. */
export function scheduleBody(f: ScheduleForm) {
  const startsAt = f.date && f.start ? zonedInstant(f.date, f.start, f.timezone) : null;
  const endsAt = startsAt && f.end ? zonedInstant(f.end > f.start ? f.date : addDays(f.date, 1), f.end, f.timezone) : null;
  return { title: f.title.trim() || null, occasion: f.occasion.trim() || null, startsAt, endsAt, timezone: startsAt ? f.timezone : null };
}
