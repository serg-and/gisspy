import type {
  Redirect,
  GetServerSideProps,
  GetStaticProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  GetStaticPropsContext,
  GetStaticPropsResult,
} from "next";

export type Promisable<T> = T | Promise<T>;

type RedirectRes = { notFound: true } | { redirect: Redirect };

export type Layer<Ctx, D, P> = (context: {
  ctx: Ctx;
  data: D;
  props: P;
}) => Promisable<RedirectRes | { data?: object; props?: object }>;

type LayerRes<T extends Layer<any, any, any>> = Exclude<
  Awaited<ReturnType<T>>,
  RedirectRes
>;

type LayerData<T extends Layer<any, any, any>> = LayerRes<T> extends never
  ? never
  : LayerRes<T> extends { data: infer R }
  ? R extends object
    ? R
    : never
  : never;

type LayerProps<T extends Layer<any, any, any>> = LayerRes<T> extends never
  ? never
  : LayerRes<T> extends { props: infer P }
  ? P extends object
    ? P
    : never
  : never;

type MiddlewareType = "ServerSideProps" | "StaticProps";
type Props = { [key: string]: any };

type GetType<
  T extends MiddlewareType,
  P extends Props = Props
> = T extends "ServerSideProps" ? GetServerSideProps<P> : GetStaticProps<P>;

type GetContext<T extends MiddlewareType> = T extends "ServerSideProps"
  ? GetServerSidePropsContext
  : GetStaticPropsContext;

type GetResult<
  T extends MiddlewareType,
  P extends Props = Props
> = T extends "ServerSideProps"
  ? GetServerSidePropsResult<P>
  : GetStaticPropsResult<P>;

class PageMiddlewareFactory<
  T extends MiddlewareType,
  D extends object = {},
  P extends object = {}
> {
  private layers: Layer<GetContext<T>, any, P>[];

  constructor(layers?: Layer<GetContext<T>, any, P>[]) {
    this.layers = layers ?? [];
  }

  public use<L extends Layer<GetContext<T>, D, P>>(layer: L) {
    type Data = LayerData<L>;
    type NewData = Data extends never ? D : Data & Omit<D, keyof Data>;

    type Props = LayerProps<L>;
    type NewProps = Props extends never ? P : Props & Omit<P, keyof Props>;

    return new PageMiddlewareFactory<T, NewData, NewProps>([
      ...this.layers,
      layer,
    ]);
  }

  public handler<Props extends { [key: string]: any } = { [key: string]: any }>(
    fn?: (context: {
      ctx: GetContext<T>;
      data: D;
      props: P;
    }) => Promisable<GetResult<T, Props>>
  ): GetType<T, P & Props> {
    return (async (ctx: GetContext<T>) => {
      const data = {};
      const props = {};

      for (const layer of this.layers) {
        // @ts-expect-error mixed generics
        const res = await layer({ ctx, data, props });
        if ("notFound" in res || "redirect" in res) return res;

        if (res.data) Object.assign(data, res.data);
        if (res.props) Object.assign(props, res.props);
      }

      if (fn) {
        const res = await fn({ ctx, data: data as D, props: props as P });
        if ("notFound" in res || "redirect" in res) return res;

        Object.assign(props, await res.props);
      }

      return { props: props as P & Props };
    }) as GetType<T, P & Props>;
  }
}

export type ServerMiddlewareFactory<
  D extends object = {},
  P extends object = {}
> = PageMiddlewareFactory<"ServerSideProps", D, P>;

export type StaticMiddlewareFactory<
  D extends object = {},
  P extends object = {}
> = PageMiddlewareFactory<"StaticProps", D, P>;

/**
 * Infers to props returned from a middleware handler
 *
 * ```tsx
 * export const getServerSideProps = serverMiddleware().handler(() => ({
 *   props: { value: "" },
 * }));
 *
 * export default (props: InferProps<typeof getServerSideProps>) => (
 *   <div>client: {props.value}</div>
 * );
 * ```
 */
export type InferProps<T extends GetServerSideProps | GetStaticProps> = Awaited<
  Extract<Awaited<ReturnType<T>>, { props: any }>["props"]
>;

/**
 * Create new middleware for {@link GetServerSideProps}
 *
 * @example
 * ```ts
 * export const getServerSideProps = serverMiddleware()
 *   .use(({ ctx }) => ({ data: { user: ctx.req.cookies["USER"] } }))
 *   .handler(({ data }) => {
 *     return { props: { userId: data.user } };
 *   });
 * ```
 *
 * Middleware can be reused and extended on multiple pages:
 * @example
 * ```ts
 * const middleware = serverMiddleware().use(({ ctx }) => ({
 *   data: { user: ctx.req.cookies["USER"] },
 * }));
 *
 * // page.tsx
 * export const getServerSideProps = middleware.handler(({ data }) => ({
 *   props: { user: data.user },
 * }));
 *
 * // other-page.tsx
 * export const getServerSideProps = middleware
 *   .use(({ ctx }) => {
 *     const client = ctx.req.cookies["CLIENT"];
 *     if (!client) return { notFound: true };
 *     return { data: { client } };
 *   })
 *   .handler(({ data }) => ({
 *     props: { client: data.client },
 *   }));
 *  ```
 *
 * Common props between routes and middlewares can be passed from a middleware layer.
 * Props from middleware layers will be merged with props from your handler.
 * @example
 * ```tsx
 * const dashboardMiddleware = serverMiddleware().use(({ ctx }) => ({
 *   props: { client: ctx.req.cookies["CLIENT"] },
 * }));
 *
 * // page.tsx
 * export const getServerSideProps = dashboardMiddleware.handler(() => ({
 *   props: { otherData: 'hi' }
 * }))
 *
 * export default (props) => (
 *   <div>client: {props.client}</div>
 * )
 * ```
 */
export const serverMiddleware = () =>
  new PageMiddlewareFactory<"ServerSideProps">();

/**
 * Create a reusable middleware layer
 *
 * @example
 * ```ts
 * const reusableLayer = serverLayer(() => ({ data: { some: "data" } }));
 *
 * serverMiddleware()
 *   .use(reusableLayer)
 *   .handler();
 *
 * ```
 */
export const serverLayer = <T extends Layer<GetServerSidePropsContext, {}, {}>>(
  layer: T
): T => layer;

/**
 * Similar to {@link serverLayer}, but with the option a generic parameter for an expected context type.
 * Create a reusable middleware layer with a given expected context.
 *
 * @example
 * ```ts
 * const reusableLayer = serverLayerWithContext<{ client: string }>()(
 *   ({ data }) => {
 *     if (data.client === "test") return { notFound: true };
 *     return { data: {} };
 *   }
 * );
 *
 * serverMiddleware()
 *   .use(() => ({ data: { client: "abc" } }))
 *   // will type error if `{ client: string }` is not in data
 *   .use(reusableLayer)
 *   .handler();
 * ```
 *
 * Expected props can be specified with the second generics parameter
 * @example
 * ```ts
 * serverLayerWithContext<{}, { someProp: string }>()(() => ({}));
 * ```
 */
export const serverLayerWithContext =
  <ExpectedData extends {}, ExpectedProps extends {} = {}>() =>
  <T extends Layer<GetServerSidePropsContext, ExpectedData, ExpectedProps>>(
    layer: T
  ) =>
    layer as unknown as (
      ...args: Parameters<
        Layer<GetServerSidePropsContext, ExpectedData, ExpectedProps>
      >
    ) => ReturnType<T>;

/**
 * Create new middleware for {@link GetStaticProps}
 *
 * @example
 * ```ts
 * export const getStaticProps = staticMiddleware()
 *   .use(({ ctx }) => ({ data: { page: ctx.params['page'] } }))
 *   .handler(({ data }) => {
 *     return { props: { pageId: data.page } };
 *   });
 * ```
 *
 * Middleware can be reused and extended on multiple pages:
 * @example
 * ```ts
 * const middleware = staticMiddleware().use(({ ctx }) => ({
 *   data: { page: ctx.params['page'] },
 * }));
 *
 * // page.tsx
 * export const getStaticProps = middleware.handler(({ data }) => ({
 *   props: { pageId: data.page },
 * }));
 *
 * // other-page.tsx
 * export const getStaticProps = middleware
 *   .use(({ ctx }) => {
 *     const client = ctx.params["CLIENT"];
 *     if (!client) return { notFound: true };
 *     return { data: { client } };
 *   })
 *   .handler(({ data }) => ({
 *     props: { client: data.client },
 *   }));
 *  ```
 *
 * Common props between routes and middlewares can be passed from a middleware layer.
 * Props from middleware layers will be merged with props from your handler.
 * @example
 * ```tsx
 * const dashboardMiddleware = staticMiddleware().use(({ ctx }) => ({
 *   props: { client: ctx.params["CLIENT"] },
 * }));
 *
 * // page.tsx
 * export const getStaticProps = dashboardMiddleware.handler(() => ({
 *   props: { otherData: 'hi' }
 * }))
 *
 * export default (props) => (
 *   <div>client: {props.client}</div>
 * )
 * ```
 */
export const staticMiddleware = () =>
  new PageMiddlewareFactory<"StaticProps">();

/**
 * Create a reusable middleware layer
 *
 * @example
 * ```ts
 * const reusableLayer = staticLayer(() => ({ data: { some: "data" } }));
 *
 * staticMiddleware()
 *   .use(reusableLayer)
 *   .handler();
 *
 * ```
 */
export const staticLayer = <T extends Layer<GetStaticPropsContext, {}, {}>>(
  layer: T
): T => layer;

/**
 * Similar to {@link staticLayer}, but with the option for a generic parameter for an expected context type.
 * Create a reusable middleware layer with a given expected context.
 *
 * @example
 * ```ts
 * const reusableLayer = staticLayerWithContext<{ client: string }>()(
 *   ({ data }) => {
 *     if (data.client === "test") return { notFound: true };
 *     return { data: {} };
 *   }
 * );
 *
 * staticMiddleware()
 *   .use(() => ({ data: { client: "abc" } }))
 *   // will type error if `{ client: string }` is not in data
 *   .use(reusableLayer)
 *   .handler();
 * ```
 *
 * Expected props can be specified with the second generics parameter
 * @example
 * ```ts
 * staticLayerWithContext<{}, { someProp: string }>()(() => ({}));
 * ```
 */
export const staticLayerWithContext =
  <ExpectedData extends {}, ExpectedProps extends {} = {}>() =>
  <T extends Layer<GetStaticPropsContext, ExpectedData, ExpectedProps>>(
    layer: T
  ) =>
    layer as unknown as (
      ...args: Parameters<
        Layer<GetStaticPropsContext, ExpectedData, ExpectedProps>
      >
    ) => ReturnType<T>;
