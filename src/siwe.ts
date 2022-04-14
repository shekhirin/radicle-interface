/* eslint-disable @typescript-eslint/naming-convention */
import { SiweMessage } from "siwe";
import * as api from '@app/api';
import type { Config } from "@app/config";
import { removePrefix } from "@app/utils";
import { connectSeed } from "./session";
import type { Seed } from "./base/seeds/Seed";

export interface SeedSession {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chain_id: string;
  nonce: string;
  issued_at: number;
  expiration_time: number;
  resources: string[];
}

///     ┌────┐                                                                              ┌───┐
///     │ UI │                                                                              │API│
///     └─┬──┘                                                                              └─┬─┘
///       │  POST /v1/sessions                                                                │
///       │──────────────────────────────────────────────────────────────────────────────────>│
///       │                                                                                   │
///       │  RESPONSE : { "nonce": "l5pUJO4YLN3", "session_id": "a6d4174...140166" }          │
///       │<──────────────────────────────────────────────────────────────────────────────────│
///       │                                                                                   │
///       │  PUT /v1/sessions/${session_id}  { "payload": signedSIWEMessage}                  │
///       │──────────────────────────────────────────────────────────────────────────────────>│
///       │                                                                                   │
///       │  RESPONSE { "id": "a6d4174...140166", "session": session_object }                 │
///       │<──────────────────────────────────────────────────────────────────────────────────│
///     ┌────┐                                                                              ┌───┐
///     │ UI │                                                                              │API│
///     └─┬──┘                                                                              └─┬─┘

export function createSiweMessage(seed: Seed, address: string, nonce: string, config: Config): string {
  const date = new Date();
  const expirationTime = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).toISOString();

  const message = new SiweMessage({
    domain: seed.api.host,
    address,
    statement: `Sign in with Ethereum to ${seed.api.host}`,
    uri: window.location.origin,
    nonce,
    version: '1',
    resources: [`rad:git:${seed.id}`],
    expirationTime,
    chainId: config.network.chainId
  });

  return message.prepareMessage();
}

export async function createUnauthorizedSession(host: api.Host): Promise<{ nonce: string; id: string }> {
  return await api.post(`sessions`, host);
}

// A sample API call to how we should be calling the http-api
export async function callProtectedRoute(host: api.Host, id: string): Promise<SeedSession> {
  return await api.get(`sessions`, host, {}, { 'Content-Type': 'application/json', "Authorization": id });
}

export async function signInWithEthereum(seed: Seed, config: Config): Promise<{ id: string; session: SeedSession } | null> {
  if (! config.signer) {
    return null;
  }

  const result = await createUnauthorizedSession(seed.api);
  const address = await config.signer.getAddress();
  const message = createSiweMessage(seed, address, result.nonce, config);
  const signature = await config.signer.signMessage(message);

  await api.put(`sessions/${result.id}`, seed.api, { message, signature: removePrefix(signature) });
  const session: SeedSession = await api.get(`sessions`, seed.api, {}, { 'Content-Type': 'application/json', "Authorization": result.id });
  connectSeed({ id: result.id, session });

  return { id: result.id, session };
}
