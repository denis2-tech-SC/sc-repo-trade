import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

export type TradeUser = {
  id: string;
  nickname: string;
  discordNickname: string;
  accountLink: string;
  category?: 'main' | 'less' | 'vacation' | 'completed';
};

export type TradeUsersDb = {
  users: TradeUser[];
  tableUsers: Record<string, Array<string | null>>;
  ratioOverrides?: Record<string, Record<string, Record<string, string>>>;
  ratioNotes?: Record<string, Record<string, Record<string, string>>>;
  ratioColors?: Record<string, Record<string, Record<string, string>>>;
  userHeaderColors?: Record<string, Record<string, string>>;
  updatedAt: string;
};

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DB_DIR, 'trade-users.json');

const createDefaultDb = (): TradeUsersDb => ({
  users: [],
  tableUsers: {},
  ratioOverrides: {},
  ratioNotes: {},
  ratioColors: {},
  userHeaderColors: {},
  updatedAt: new Date().toISOString(),
});

const isValidDbShape = (value: unknown): value is TradeUsersDb => {
  if (!value || typeof value !== 'object') return false;
  const maybeDb = value as Partial<TradeUsersDb>;
  if (!Array.isArray(maybeDb.users)) return false;
  if (!maybeDb.tableUsers || typeof maybeDb.tableUsers !== 'object') return false;
  return true;
};

const ensureDbFileExists = async () => {
  await mkdir(DB_DIR, { recursive: true });
  try {
    await access(DB_FILE, fsConstants.F_OK);
  } catch {
    const defaultDb = createDefaultDb();
    await writeFile(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf8');
  }
};

export const readTradeUsersDb = async (): Promise<TradeUsersDb> => {
  await ensureDbFileExists();
  const raw = await readFile(DB_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!isValidDbShape(parsed)) {
      return createDefaultDb();
    }
    return {
      users: parsed.users,
      tableUsers: parsed.tableUsers,
      ratioOverrides:
        parsed.ratioOverrides && typeof parsed.ratioOverrides === 'object'
          ? parsed.ratioOverrides
          : {},
      ratioNotes:
        parsed.ratioNotes && typeof parsed.ratioNotes === 'object'
          ? parsed.ratioNotes
          : {},
      ratioColors:
        parsed.ratioColors && typeof parsed.ratioColors === 'object'
          ? parsed.ratioColors
          : {},
      userHeaderColors:
        parsed.userHeaderColors && typeof parsed.userHeaderColors === 'object'
          ? parsed.userHeaderColors
          : {},
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return createDefaultDb();
  }
};

export const writeTradeUsersDb = async (
  payload: Omit<TradeUsersDb, 'updatedAt'>,
): Promise<TradeUsersDb> => {
  await ensureDbFileExists();
  const nextDb: TradeUsersDb = {
    users: payload.users,
    tableUsers: payload.tableUsers,
    ratioOverrides: payload.ratioOverrides ?? {},
    ratioNotes: payload.ratioNotes ?? {},
    ratioColors: payload.ratioColors ?? {},
    userHeaderColors: payload.userHeaderColors ?? {},
    updatedAt: new Date().toISOString(),
  };
  await writeFile(DB_FILE, JSON.stringify(nextDb, null, 2), 'utf8');
  return nextDb;
};

