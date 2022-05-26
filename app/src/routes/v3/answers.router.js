// body of post requests look like:
// {
//  method: file, link
//  email: email address
//  fileType: csv, fwbundle
//  fields: [ fields ]
// }

const logger = require("logger").default;
const Router = require("koa-router");
const AnswerService = require("../../services/answers.service");
const FileService = require("../../services/file.service");
import createShareableLink from "services/s3.service";

const router = new Router({
  prefix: "/exports/reports/:templateid"
});

class AnswerRouter {
  static async export(ctx) {
    let file;
    // create file
    switch (ctx.request.body.fileType) {
      case "csv":
        file = FileService.createCsv(ctx.payload, ctx.request.body.fields);
        break;
      case "fwbundle":
        file = FileService.createBundle(ctx.payload, ctx.request.body.fields);
        break;
    }

    if (ctx.request.body.method === "link") {
      // upload to s3 bucket
      const URL = await createShareableLink({
        extension: `.${ctx.request.body.fileType}`,
        body: file
      });
      ctx.body = URL;
    } else {
      ctx.type = "text/csv";
      ctx.body = file;
    }
    ctx.status = 200;
  }
}

const getAnswer = async (ctx, next) => {
  const answer = await AnswerService.getAnswer(ctx.request.params);
  if (!answer) ctx.throw(404, "This answer doesn't exist");
  else ctx.payload = [answer];
  await next();
};

const getAnswers = async (ctx, next) => {
  const answers = await AnswerService.getAnswers(ctx.request.params);
  ctx.payload = answers;
  await next();
};

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

router.post("/exportOne/:answerid", isAuthenticatedMiddleware, getAnswer, AnswerRouter.export);
router.post("/exportAll", isAuthenticatedMiddleware, getAnswers, AnswerRouter.export);

export default router;
