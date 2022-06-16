// body of post requests look like:
// {
//  language: "en"
//  fileType: csv, fwbundle
//  fields: [ fields ]
// }

const logger = require("logger").default;
const Router = require("koa-router");
const AnswerService = require("../../services/answers.service");
const FileService = require("../../services/reportFile.service");
import createShareableLink from "services/s3.service";

const router = new Router({
  prefix: "/exports/reports/:templateid"
});

class AnswerRouter {
  static async export(ctx) {
    let file = "";

    if (!ctx.template.attributes.languages.includes(ctx.request.body.language))
      ctx.throw(404, "Please enter a valid language");

    // create file
    switch (ctx.request.body.fileType) {
      case "csv":
        file = await FileService.createCsv(
          ctx.payload,
          ctx.request.body.fields,
          ctx.template,
          ctx.request.body.language
        );
        break;
      case "fwbundle":
        file = await FileService.createBundle(ctx.payload, ctx.template);
        break;
      default:
        ctx.throw(404, "Please enter a valid file type (csv or fwbundle)");
        break;
    }

    // read the zip file and upload to s3 bucket
    const URL = await createShareableLink({
      extension: `.${ctx.request.body.fileType === "fwbundle" ? "fwbundle" : "zip"}`,
      body: file
    });
    ctx.body = { data: URL };
    ctx.status = 200;
  }
}

const getAnswer = async (ctx, next) => {
  const answer = await AnswerService.getAnswer(ctx.request.params);
  if (!answer) ctx.throw(404, "This answer doesn't exist");
  else ctx.payload = answer;
  await next();
};

const getAnswers = async (ctx, next) => {
  const answers = await AnswerService.getAnswers(ctx.request.params);
  ctx.payload = answers;
  await next();
};

const getTemplate = async (ctx, next) => {
  const template = await AnswerService.getTemplate(ctx.request.params.templateid);
  ctx.template = template;
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

router.post("/exportOne/:answerid", isAuthenticatedMiddleware, getTemplate, getAnswer, AnswerRouter.export);
router.post("/exportAll", isAuthenticatedMiddleware, getTemplate, getAnswers, AnswerRouter.export);

export default router;
