import { call } from "./messaging.js";

type Params = Record<string, unknown>;

export const card = {
  list: (params: Params = {}): Promise<unknown> => call("card.list", params),
  meta: (params: Params): Promise<unknown> => call("card.meta", params),
  entries: (params: Params): Promise<unknown> => call("card.entries", params),
  search: (params: Params): Promise<unknown> => call("card.search", params),
  entry: (params: Params): Promise<unknown> => call("card.entry", params),
  many: (params: Params): Promise<unknown> => call("card.entry.many", params),
  update: (params: Params): Promise<unknown> => call("card.entry.update", params),
  bulk: (params: Params): Promise<unknown> => call("card.entry.bulk", params),
  add: (params: Params): Promise<unknown> => call("card.entry.add", params),
  remove: (params: Params): Promise<unknown> => call("card.entry.remove", params),
};
