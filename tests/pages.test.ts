import { describe, expect, test } from "bun:test";
import { GetServerSidePropsContext, Redirect } from "next";
import { serverLayer, serverLayerWithContext, serverMiddleware } from "../src";
import { createMocks } from "node-mocks-http";

describe("`notFound` always passes through", () => {
  test("single layer", async () => {
    const res = await serverMiddleware()
      .use(() => ({ notFound: true }))
      .handler(() => ({ props: {} }))(mockServerCtx());

    expect("notFound" in res && res.notFound === true).toBeTrue();
  });

  test("multiple layers", async () => {
    const res = await serverMiddleware()
      .use(() => ({ data: { some: "" } }))
      .use(() => ({ props: { other: 0 } }))
      .use(() => ({ notFound: true }))
      .use(() => ({
        redirect: { destination: "/", permanent: false, statusCode: 301 },
      }))
      .handler(() => ({ props: {} }))(mockServerCtx());

    expect("notFound" in res && res.notFound === true).toBeTrue();
  });

  test("from handler", async () => {
    const res = await serverMiddleware()
      .use(() => ({ data: { some: "" } }))
      .use(() => ({ props: { other: 0 } }))
      .handler(() => ({
        props: { shouldNot: "be here" },
        notFound: true,
      }))(mockServerCtx());

    expect("notFound" in res && res.notFound === true).toBeTrue();
  });
});

describe("`Redirect` always passes through", () => {
  const redirect: Redirect = {
    destination: "/",
    permanent: false,
    statusCode: 301,
  };

  test("single layer", async () => {
    const res = await serverMiddleware()
      .use(() => ({ redirect }))
      .handler(() => ({ props: {} }))(mockServerCtx());

    expect("redirect" in res).toBeTrue();
    expect("redirect" in res ? res.redirect : undefined).toStrictEqual(
      redirect
    );
  });

  test("multiple layers", async () => {
    const res = await serverMiddleware()
      .use(() => ({ data: { some: "" } }))
      .use(() => ({ props: { other: 0 } }))
      .use(() => ({ redirect }))
      .use(() => ({
        redirect: { destination: "/second", permanent: false, statusCode: 301 },
      }))
      .use(() => ({ notFound: true }))
      .handler(() => ({ props: {} }))(mockServerCtx());

    expect("redirect" in res).toBeTrue();
    expect("redirect" in res ? res.redirect : undefined).toStrictEqual(
      redirect
    );
  });

  test("from handler", async () => {
    const res = await serverMiddleware()
      .use(() => ({ data: { some: "" } }))
      .use(() => ({ props: { other: 0 } }))
      .handler(() => ({
        props: { shouldNot: "be here" },
        redirect,
      }))(mockServerCtx());

    expect("redirect" in res).toBeTrue();
    expect("redirect" in res ? res.redirect : undefined).toStrictEqual(
      redirect
    );
  });
});

describe("Merge `data` between layers", () => {
  test("combine different keys", async () => {
    await serverMiddleware()
      .use(() => ({ data: { a: "a" } }))
      .use(() => ({ data: { b: "b" } }))
      .use(({ data }) => {
        expect(data).toStrictEqual({ a: "a", b: "b" });
        return {};
      })
      .handler(({ data }) => {
        expect(data).toStrictEqual({ a: "a", b: "b" });
        return { props: {} };
      })(mockServerCtx());
  });

  test("overwrite values", async () => {
    await serverMiddleware()
      .use(() => ({ data: { a: "a" } }))
      .use(() => ({ data: { a: "a2", b: "b" } }))
      .use(({ data }) => {
        expect(data).toStrictEqual({ a: "a2", b: "b" });
        return { data: { a: "a3", b: "b", c: "c" } };
      })
      .handler(({ data }) => {
        expect(data).toStrictEqual({ a: "a3", b: "b", c: "c" });
        return { props: {} };
      })(mockServerCtx());
  });

  test("overwrite types", async () => {
    await serverMiddleware()
      .use(() => ({ data: { value: "" } }))
      .use(
        serverLayerWithContext<{ value: string }>()(({}) => ({
          data: { value: 0 },
        }))
      )
      .use(({}) => ({
        data: { value: false },
      }))
      .use(
        serverLayerWithContext<{ value: boolean }>()(() => ({
          data: { value: 1 },
        }))
      )
      .handler(({ data }) => {
        expect(data).toStrictEqual({ value: 1 });
        return { props: {} };
      })(mockServerCtx());
  });
});

describe("Merge `props` between layers", () => {
  test("combine different keys", async () => {
    await serverMiddleware()
      .use(() => ({ props: { a: "a" } }))
      .use(() => ({ props: { b: "b" } }))
      .use(({ props }) => {
        expect(props).toStrictEqual({ a: "a", b: "b" });
        return {};
      })
      .handler(({ props }) => {
        expect(props).toStrictEqual({ a: "a", b: "b" });
        return { props: {} };
      })(mockServerCtx());
  });

  test("overwrite values", async () => {
    await serverMiddleware()
      .use(() => ({ props: { a: "a1" } }))
      .use(() => ({ props: { a: "a2", b: "b" } }))
      .use(({ props }) => {
        expect(props).toStrictEqual({ a: "a2", b: "b" });
        return { props: { a: "a3", b: "b", c: "c" } };
      })
      .handler(({ props }) => {
        expect(props).toStrictEqual({ a: "a3", b: "b", c: "c" });
        return { props: {} };
      })(mockServerCtx());
  });

  test("overwrite types", async () => {
    await serverMiddleware()
      .use(() => ({ props: { value: "" } }))
      .use(
        serverLayerWithContext<{}, { value: string }>()(({}) => ({
          props: { value: 0 },
        }))
      )
      .use(({}) => ({
        props: { value: false },
      }))
      .use(
        serverLayerWithContext<{}, { value: boolean }>()(() => ({
          props: { value: 1 },
        }))
      )
      .handler(({ props }) => {
        expect(props).toStrictEqual({ value: 1 });
        return { props: {} };
      })(mockServerCtx());
  });

  test("add layer props to handler response", async () => {
    const res = await serverMiddleware()
      .use(() => ({ props: { a: "a" } }))
      .handler(() => ({ props: { b: "b" } }))(mockServerCtx());

    expect("props" in res ? await res.props : {}).toStrictEqual({
      a: "a",
      b: "b",
    });
  });

  test("overwrite layer props with handler response props", async () => {
    const res = await serverMiddleware()
      .use(() => ({ props: { a: "a1" } }))
      .handler(() => ({ props: { a: "a2", b: "b" } }))(mockServerCtx());

    expect("props" in res ? await res.props : {}).toStrictEqual({
      a: "a2",
      b: "b",
    });
  });
});

test("Can reuse middlware without mixing layers", async () => {
  const middleware = serverMiddleware().use(() => ({ data: { layer1: true } }));

  const handler2 = middleware
    .use(() => ({ data: { layer2: true } }))
    .handler(({ data }) => {
      expect(data).toStrictEqual({ layer1: true, layer2: true });
      return { props: {} };
    });

  const handler1 = middleware
    .use(() => ({ data: { layer3: true } }))
    .handler(({ data }) => {
      expect(data).toStrictEqual({ layer1: true, layer3: true });
      return { props: {} };
    });

  await handler2(mockServerCtx());
  await handler1(mockServerCtx());
});

test("Layer with data context", async () => {
  const expectedLayer = serverLayer(() => ({ data: { a: true } }));
  const contextLayer = serverLayerWithContext<{ a: boolean }>()(({ data }) => {
    expect(typeof data.a).toBe("boolean");
    return { data: { b: true } };
  });

  // @ts-expect-error should error because expected data in context is not there
  serverMiddleware().use(contextLayer);

  await serverMiddleware()
    .use(expectedLayer)
    .use(contextLayer)
    .handler(({ data }) => {
      expect(data).toStrictEqual({ a: true, b: true });
      return { props: {} };
    })(mockServerCtx());
});

test("Layer with props context", async () => {
  const expectedLayer = serverLayer(() => ({ props: { a: true } }));
  const contextLayer = serverLayerWithContext<{}, { a: boolean }>()(
    ({ props }) => {
      expect(typeof props.a).toBe("boolean");
      return { props: { b: true } };
    }
  );

  // @ts-expect-error should error because expected props in context is not there
  serverMiddleware().use(contextLayer);

  await serverMiddleware()
    .use(expectedLayer)
    .use(contextLayer)
    .handler(({ props }) => {
      expect(props).toStrictEqual({ a: true, b: true });
      return { props: {} };
    })(mockServerCtx());
});

function mockServerCtx(
  options?: Partial<Omit<GetServerSidePropsContext, "req" | "res">>
): GetServerSidePropsContext {
  const { req, res } = createMocks();
  return { req, res, query: {}, resolvedUrl: "", ...options };
}
