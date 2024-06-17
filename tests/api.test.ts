import { describe, expect, test } from "bun:test";
import { NextApiRequest, NextApiResponse } from "next";
import { apiLayer, apiLayerWithContext, apiMiddleware } from "../src";
import { createMocks } from "node-mocks-http";

describe("End on `{ stop: true }`", async () => {
  test("Dont call next layers", async () => {
    let i = 0;
    await apiMiddleware()
      .use(() => ({ stop: true }))
      .use(() => {
        i = 1;
      })
      .handler(() => {})(...mockApiCtx());

    expect(i).toBe(0);
  });

  test("Dont call next handler", async () => {
    let i = 0;
    await apiMiddleware()
      .use(() => ({ stop: true }))
      .handler(() => {
        i = 1;
      })(...mockApiCtx());

    expect(i).toBe(0);
  });

  test("Does continue without `{ stop: true }`", async () => {
    let i = 0;
    await apiMiddleware()
      .use(() => {
        i++;
      })
      .handler(() => {
        i++;
      })(...mockApiCtx());

    expect(i).toBe(2);
  });
});

describe("Merge `data` between layers", () => {
  test("combine different keys", async () => {
    await apiMiddleware()
      .use(() => ({ data: { a: "a" } }))
      .use(() => {}) // empty layer
      .use(() => ({ data: { b: "b" } }))
      .use(({ data }) => {
        expect(data).toStrictEqual({ a: "a", b: "b" });
        return { data: { c: "c" } };
      })
      .handler(({ data }) => {
        expect(data).toStrictEqual({ a: "a", b: "b", c: "c" });
      })(...mockApiCtx());
  });

  test("overwrite values", async () => {
    await apiMiddleware()
      .use(() => ({ data: { a: "a" } }))
      .use(() => {}) // empty layer
      .use(() => ({ data: { a: "a2", b: "b" } }))
      .use(({ data }) => {
        expect(data).toStrictEqual({ a: "a2", b: "b" });
        return { data: { a: "a3", b: "b", c: "c" } };
      })
      .handler(({ data }) => {
        expect(data).toStrictEqual({ a: "a3", b: "b", c: "c" });
      })(...mockApiCtx());
  });

  test("overwrite types", async () => {
    await apiMiddleware()
      .use(() => ({ data: { value: "" } }))
      .use(() => {}) // empty layer
      .use(
        apiLayerWithContext<{ value: string }>()(({}) => ({
          data: { value: 0 },
        }))
      )
      .use(({}) => ({
        data: { value: false },
      }))
      .use(
        apiLayerWithContext<{ value: boolean }>()(() => ({
          data: { value: 1 },
        }))
      )
      .handler(({ data }) => {
        expect(data).toStrictEqual({ value: 1 });
      })(...mockApiCtx());
  });
});

test("Can reuse middlware without mixing layers", async () => {
  const middleware = apiMiddleware().use(() => ({ data: { layer1: true } }));

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

  await handler2(...mockApiCtx());
  await handler1(...mockApiCtx());
});

test("Layer with data context", async () => {
  const expectedLayer = apiLayer(() => ({ data: { a: true } }));
  const contextLayer = apiLayerWithContext<{ a: boolean }>()(({ data }) => {
    expect(typeof data.a).toBe("boolean");
    return { data: { b: true } };
  });

  // @ts-expect-error should error because expected data in context is not there
  apiMiddleware().use(contextLayer);

  await apiMiddleware()
    .use(expectedLayer)
    .use(contextLayer)
    .handler(({ data }) => {
      expect(data).toStrictEqual({ a: true, b: true });
      return { props: {} };
    })(...mockApiCtx());
});

function mockApiCtx(): [NextApiRequest, NextApiResponse] {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>();
  return [req, res];
}

const layer = apiLayerWithContext();
