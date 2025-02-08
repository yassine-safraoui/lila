import { type ObjectStorage, objectStorage, keys } from 'common/objectStorage';
import { LocalGame, type GameStatus } from './localGame';
import { clockToSpeed } from './game';
import { myUserId } from 'common';

export class LocalDb {
  store: ObjectStorage<LocalGame, GameId> | undefined;
  lite: ObjectStorage<LiteGame, GameId> | undefined;
  current?: GameId;

  constructor() {}

  async init(): Promise<this> {
    [this.store, this.lite] = await Promise.all([
      objectStorage<LocalGame, GameId>({
        store: 'local.games',
      }),
      objectStorage<LiteGame, GameId>({
        store: 'local.games.lite',
        version: 2,
        indices: [
          { name: 'createdAt', keyPath: 'createdAt' },
          { name: 'white', keyPath: 'white' },
          { name: 'black', keyPath: 'black' },
          { name: 'finished', keyPath: 'finished' },
          { name: 'status', keyPath: 'finished.status' },
          { name: 'winner', keyPath: 'finished.winner' },
        ],
      }),
    ]);
    return this;
  }

  get lastId(): GameId | undefined {
    return localStorage.getItem(`local.${myUserId() ?? 'anonymous'}.gameId`) || undefined;
  }

  set lastId(id: GameId | undefined) {
    if (id) localStorage.setItem(`local.${myUserId() ?? 'anonymous'}.gameId`, id);
    else localStorage.removeItem(`local.${myUserId() ?? 'anonymous'}.gameId`);
  }

  async getOne(id: GameId | undefined = this.lastId): Promise<LocalGame | undefined> {
    // optional chaining in query methods as idb can be undefined in legacy incognito
    return id ? this.store?.get(id) : Promise.resolve(undefined);
  }

  async infoByDate(lower: number | undefined, upper: number | undefined): Promise<LiteGame[]> {
    console.log(lower, upper);
    const games: LiteGame[] = [];
    await this.lite?.readCursor({ index: 'createdAt', keys: keys({ above: lower, below: upper }) }, info =>
      games.push(info),
    );
    return games;
  }

  async ongoing(): Promise<LiteGame[]> {
    const games: LiteGame[] = [];
    await this.lite?.readCursor({ index: 'finished', keys: undefined }, info => games.push(info));
    return games;
  }

  delete(ids?: GameId[] | GameId): Promise<any> {
    if (!ids) return Promise.all([this.store?.clear(), this.lite?.clear()]);
    else
      return Promise.all(
        [ids].flat().map(id => {
          this.store?.remove(id);
          this.lite?.remove(id);
        }),
      );
  }

  async put(game: LocalGame): Promise<void> {
    const lite = gameInfo(game);
    game = structuredClone(game);
    await Promise.all([this.store?.put(game.id, game), this.lite?.put(lite.id, lite)]);
    this.lastId = game.id;
  }
  // async list(): Promise<GameId[]> {
  //   return this.store.list();
  // }
}

export interface LiteGame {
  id: string;
  white?: string;
  black?: string;
  createdAt: Millis;
  initial: Seconds;
  increment: Seconds;
  speed: Speed;
  initialFen: FEN;
  fen: FEN;
  turn: Color;
  lastMove: Uci;
  finished?: GameStatus;
}

function gameInfo(game: LocalGame): LiteGame {
  return {
    ...game,
    speed: game.initial === Infinity ? 'correspondence' : clockToSpeed(game.initial, game.increment),
    fen: game.fen,
    turn: game.turn,
    lastMove: !game.moves.length ? '' : game.moves[game.moves.length - 1].uci,
    finished: game.finished,
    //winner:
  };
}

type GameId = string;
