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
  prefix: "/exports/reports"
});

class AnswerRouter {
  static async export(ctx) {
    let file = "";

    ctx.templates.forEach(template => {
      if (!template.attributes.languages.includes(ctx.request.body.language))
        ctx.throw(404, "Please enter a valid language for all templates");
    });

    // create file
    switch (ctx.request.body.fileType) {
      case "csv":
        file = await FileService.createCsv(
          ctx.payload,
          ctx.request.body.fields,
          ctx.templates,
          ctx.request.body.language
        );
        break;
      case "fwbundle":
        file = await FileService.createBundle(ctx.payload, ctx.templates);
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

const getAnswerSet = async (ctx, next) => {
  const { ids } = ctx.request.body;
  let answers = [];
  for await (const id of ids) {
    const answer = await AnswerService.getAnswer(id);
    if (!answer[0]) ctx.throw(404, "Some answers don't exist");
    else answers.push(answer[0]);
  }
  ctx.payload = answers;
  await next();
};

const getAllAnswers = async (ctx, next) => {
  const answers = await AnswerService.getAllAnswers();
  ctx.payload = answers;
  await next();
};

const getTemplates = async (ctx, next) => {
  let templates = [];
  // loop over all found answers and get every template related to them
  for await (const answer of ctx.payload) {
    let templateId = answer.attributes.report;
    // do we already have that template?
    const existing = templates.find(template => template.id === templateId);
    if (!existing) {
      const template = await AnswerService.getTemplate(templateId);
      templates.push(template);
    }
  }
  ctx.templates = templates;
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

router.post("/exportSome", isAuthenticatedMiddleware, getAnswerSet, getTemplates, AnswerRouter.export);
router.post("/exportAll", isAuthenticatedMiddleware, getAllAnswers, getTemplates, AnswerRouter.export);

export default router;
