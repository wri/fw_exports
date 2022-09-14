import Router from "koa-router";
import createShareableLink from "services/s3.service";

const router = new Router({
  prefix: "/exports"
});

router.get("/fileURL", async ctx => {
  const URL = await createShareableLink({
    extension: ".txt",
    body: "Hello World"
  });

  ctx.status = 200;
  ctx.body = URL;
});

export default router;
