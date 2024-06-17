import { type Promisable } from "./pages";
import type { NextApiRequest, NextApiHandler, NextApiResponse } from "next";

type StopRes = { stop: true };

export type ApiLayer<D, ResponseData = any> = (context: {
  req: NextApiRequest;
  res: NextApiResponse<ResponseData>;
  data: D;
}) => Promisable<{ data: object } | StopRes | void>;

type ApiLayerRes<T extends ApiLayer<any>> = Awaited<ReturnType<T>>;

class ApiMiddlewareFactory<D extends object> {
  private layers: ApiLayer<D>[];

  constructor(layers?: ApiLayer<D>[]) {
    this.layers = layers ?? [];
  }

  public use<L extends ApiLayer<D>>(layer: L) {
    type NewData = ApiLayerRes<L> extends void | undefined
      ? D
      : ApiLayerRes<L> extends { data?: infer R }
      ? R extends object
        ? R & Omit<D, keyof R>
        : D
      : D;

    return new ApiMiddlewareFactory<NewData>([...this.layers, layer]);
  }

  public handler<ResponseData = any>(
    fn: (context: {
      req: NextApiRequest;
      res: NextApiResponse<ResponseData>;
      data: D;
    }) => Promisable<unknown>
  ): NextApiHandler<ResponseData> {
    return async (req: NextApiRequest, res: NextApiResponse<ResponseData>) => {
      const data = {} as D;

      for (const layer of this.layers) {
        const result = await layer({ req, res, data: data as D });
        if (result === undefined) continue;
        if ("stop" in result && result.stop) return;

        if ("data" in result) Object.assign(data, result.data);
      }

      return await fn({ req, res, data: data as D });
    };
  }
}

/**
 * Create middleware for an API handler. Handler can be exported as default to create an API handler.
 *
 * @example
 * ```ts
 * export default apiMiddleware()
 *   .use(({ req }) => ({ data: { user: req.cookies["USER"] } }))
 *   .handler(({ res, data }) => {
 *     res.status(200).json({ user: data.user });
 *   });
 * ```
 *
 * Middleware layers can stop a request from continuing by returning `{ stop: true }`
 *
 * @example
 * ```ts
 * export default apiMiddleware()
 *   .use(({ req, res }) => {
 *     if (!("USER" in req.cookies)) {
 *       res.status(404).write("user not found");
 *       return { stop: true };
 *     }
 *     return { data: { user: req.cookies["USER"] } };
 *   })
 *   .handler(({ res, data }) => {
 *     res.status(200).json({ user: data.user });
 *   });
 * ```
 *
 * Middleware can be reused and extended on multiple API routes:
 * @example
 * ```ts
 * const middleware = apiMiddleware().use(({ req }) => ({
 *   data: { user: req.cookies["USER"] },
 * }));
 *
 * // /api/route.tsx
 * middleware.handler(({ data }) => ({
 *   props: { user: data.user },
 * }));
 *
 * // /api/other-route.tsx
 * middleware
 *   .use(({ req, res }) => {
 *     const client = req.cookies["CLIENT"];
 *     if (!client) {
 *       res.status(404).write("user not found");
 *       return { stop: true };
 *     }
 *     return { data: { client } };
 *   })
 *   .handler(({ res, data }) => {
 *     res.status(200).json({ user: data.user, client: data.client });
 *   });
 *  ```
 */
export const apiMiddleware = () => new ApiMiddlewareFactory<{}>();

/**
 * Create a reusable middleware layer
 *
 * @example
 * ```ts
 * const reusableLayer = apiLayer(() => ({ data: { some: "data" } }));
 *
 * export default apiMiddleware()
 *   .use(reusableLayer)
 *   .handler(() => {});
 *
 * ```
 */
export const apiLayer = <T extends ApiLayer<{}>>(layer: T): T => layer;

/**
 * Similar to {@link apiLayer}, but with the option for a generic parameter for an expected context type.
 * Create a reusable middleware layer with a given expected context.
 *
 * @example
 * ```ts
 * const reusableLayer = apiLayerWithContext<{ client: string }>()(
 *   ({ res, data }) => {
 *     if (data.client === "test") {
 *       res.status(404).write("user not found");
 *       return { stop: true };
 *     }
 *   }
 * );
 *
 * apiMiddleware()
 *   .use(() => ({ data: { client: "abc" } }))
 *   // will type error if `{ client: string }` is not in data
 *   .use(reusableLayer)
 *   .handler(() => {});
 *
 * ```
 */
export const apiLayerWithContext =
  <ExpectedData extends {}>() =>
  <T extends ApiLayer<ExpectedData>>(layer: T) =>
    layer as unknown as (
      ...args: Parameters<ApiLayer<ExpectedData>>
    ) => ReturnType<T>;
