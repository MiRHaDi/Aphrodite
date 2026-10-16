import worker from "../src/index";
import type { Env } from "../src/types";

interface PagesContext {
  request: Request;
  env: Env;
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export const onRequest = (context: PagesContext): Promise<Response> => worker.fetch(
  context.request,
  context.env,
  {
    waitUntil: context.waitUntil.bind(context),
    passThroughOnException: context.passThroughOnException.bind(context),
    props: {},
  } as ExecutionContext,
);
