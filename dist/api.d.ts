import { type Promisable } from "./pages";
import type { NextApiRequest, NextApiHandler, NextApiResponse } from "next";
type StopRes = {
    stop: true;
};
export type ApiLayer<D, ResponseData = any> = (context: {
    req: NextApiRequest;
    res: NextApiResponse<ResponseData>;
    data: D;
}) => Promisable<{
    data: object;
} | StopRes | void>;
declare class ApiMiddlewareFactory<D extends object> {
    private layers;
    constructor(layers?: ApiLayer<D>[]);
    /** Add a new layer to the current middleware */
    use<L extends ApiLayer<D>>(layer: L): ApiMiddlewareFactory<Awaited<ReturnType<L>> extends void | undefined ? D : Awaited<ReturnType<L>> extends {
        data?: infer R | undefined;
    } ? R extends object ? R & Omit<D, keyof R> : D : D>;
    /** Create an API route handler with the current middleware */
    handler<ResponseData = any>(fn: (context: {
        req: NextApiRequest;
        res: NextApiResponse<ResponseData>;
        data: D;
    }) => Promisable<unknown>): NextApiHandler<ResponseData>;
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
export declare const apiMiddleware: () => ApiMiddlewareFactory<{}>;
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
export declare const apiLayer: <T extends ApiLayer<{}, any>>(layer: T) => T;
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
export declare const apiLayerWithContext: <ExpectedData extends {}>() => <T extends ApiLayer<ExpectedData, any>>(layer: T) => (context: {
    req: NextApiRequest;
    res: NextApiResponse<any>;
    data: ExpectedData;
}) => ReturnType<T>;
export {};
