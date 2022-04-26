import Router from "koa-router";
import koaSimpleHealthCheck from "koa-simple-healthcheck";

const router = new Router({
  prefix: "/healthcheck"
});

router.get("/", koaSimpleHealthCheck());

export default router;
