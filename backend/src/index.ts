import express, { Request, Response } from 'express';
import cors from 'cors';
import { readTradeUsersDb, writeTradeUsersDb, type TradeUsersDb } from './storage/tradeUsersDb';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(
  cors({
    origin: 'http://localhost:5173',
  }),
);
app.use(express.json());

type TradeStatus = 'open' | 'closed' | 'cancelled';

interface Trade {
  id: number;
  item: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  status: TradeStatus;
  createdAt: string;
}

const trades: Trade[] = [
  {
    id: 1,
    item: 'Iron Ore',
    price: 120,
    quantity: 50,
    side: 'buy',
    status: 'open',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    item: 'Gold',
    price: 1850,
    quantity: 5,
    side: 'sell',
    status: 'closed',
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    item: 'Silver',
    price: 24,
    quantity: 100,
    side: 'buy',
    status: 'open',
    createdAt: new Date().toISOString(),
  },
];

app.get('/api/trades', (req: Request, res: Response) => {
  res.json(trades);
});

app.get('/api/trade-table-users', async (_req: Request, res: Response) => {
  try {
    const db = await readTradeUsersDb();
    res.json(db);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to read local trade users DB',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.put('/api/trade-table-users', async (req: Request, res: Response) => {
  const body = req.body as Partial<TradeUsersDb>;
  if (!Array.isArray(body.users) || !body.tableUsers || typeof body.tableUsers !== 'object') {
    res.status(400).json({
      message: 'Invalid payload. Expected { users: [], tableUsers: {} }',
    });
    return;
  }

  try {
    const saved = await writeTradeUsersDb({
      users: body.users,
      tableUsers: body.tableUsers as Record<string, Array<string | null>>,
      ratioOverrides:
        body.ratioOverrides && typeof body.ratioOverrides === 'object'
          ? (body.ratioOverrides as Record<string, Record<string, Record<string, string>>>)
          : {},
      ratioNotes:
        body.ratioNotes && typeof body.ratioNotes === 'object'
          ? (body.ratioNotes as Record<string, Record<string, Record<string, string>>>)
          : {},
      ratioColors:
        body.ratioColors && typeof body.ratioColors === 'object'
          ? (body.ratioColors as Record<string, Record<string, Record<string, string>>>)
          : {},
      userHeaderColors:
        body.userHeaderColors && typeof body.userHeaderColors === 'object'
          ? (body.userHeaderColors as Record<string, Record<string, string>>)
          : {},
    });
    res.json(saved);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to write local trade users DB',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend server listening on http://localhost:${PORT}`);
});

