# app/src/routes

Any routes for the app, should include the `.router.ts` extension.

The default export **must** be a `Router` object from the `koa-router` package.

Any default exported function found in files within this folder will automatically be used as a middleware functions for the Koa app. No need to import them elsewhere!

And for any nested files the routes will be prefixed with the nested folder structure.

For any files named `index.router.ts` its router will be prefixed with its parent's folder name.

Examples:

```typescript
// app/src/routes/test.router.ts
import Router from "koa-router";

const router = new Router();

router.get("/ping", ctx => {
  ctx.status = 200;
  ctx.body = "pong";
});

export default router;
```
`http://.../ping` --> `pong`

With nested files:
```typescript
// app/src/routes/v1/test.router.ts
import Router from "koa-router";

const router = new Router();

router.get("/ping", ctx => {
  ctx.status = 200;
  ctx.body = "pong";
});

export default router;
```
`http://.../v1/ping` --> `pong`

Example for `index.router.ts`
```typescript
// app/src/routes/v1/ping/index.router.ts
import Router from "koa-router";

const router = new Router();

router.get("/", ctx => {
  ctx.status = 200;
  ctx.body = "pong";
});

export default router;
```
`http://.../v1/ping` --> `pong`
