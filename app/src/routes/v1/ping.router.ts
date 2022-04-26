import Router from "koa-router";

const router = new Router();

router.get("/exports/ping", ctx => {
  ctx.status = 200;
  ctx.body = "pong";
});

export default router;
