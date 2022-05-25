import Router from "koa-router";

const router = new Router({
  prefix: "/reports/:templateid"
});

class AnswerRouter {

  static async exportOneAnswer(ctx) {
    // get a single answer by its id
    const answer = await AnswerService.getAnswer(ctx.request.params)

    // package into correct file format

  }

  static async exportAllAnswers(ctx) {

  }

}

const isAuthenticatedMiddleware = async (ctx, next) => {
  logger.info(`Verifying if user is authenticated`);
  const { query, body } = ctx.request;

  const user = {
    ...(query.loggedUser ? JSON.parse(query.loggedUser) : {}),
    ...body.loggedUser
  };

  if (!user || !user.id) {
    ctx.throw(401, "Unauthorized");
    return;
  }
  await next();
};

router.post("/exportOne/:id", isAuthenticatedMiddleware, AnswerRouter.exportOneAnswer);
router.post("/exportAll", isAuthenticatedMiddleware, AnswerRouter.exportOneAnswer);

export default router;
