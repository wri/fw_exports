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
const BucketURLModel = require("../../models/bucketURL.model");
const { ObjectId } = require("mongoose").Types;
const SparkpostService = require("../../services/sparkpost.service");
const AdmZip = require("adm-zip");

const router = new Router({
  prefix: "/exports/reports"
});

const exportFunction = async (id, payload, fields, templates, language, fileType, email) => {
  let file = "";

  try {
    // create file
    switch (fileType) {
      case "geojson":
        file = await FileService.createGeojson(payload);
        break;
      case "shp":
        file = await FileService.createShape(payload, fields);
        break;
      case "csv":
        file = await FileService.createCsv(payload, fields, templates, language);
        break;
      case "fwbundle":
        file = await FileService.createBundle(payload, templates);
        break;
      case "pdf":
        file = await FileService.createPDF(payload, templates, fields, language);
        break;
      default:
        break;
    }

    let URL = "";
    if (fileType === "shp") {
      const zip = new AdmZip(file);
      // read the zip file and upload to s3 bucket
      URL = await createShareableLink({
        extension: `.zip`, // `.${fileType === "fwbundle" ? "gfwbundle" : "zip"}`,
        body: zip.toBuffer()
      });
    } else {
      // read the zip file and upload to s3 bucket
      logger.info("Uploading to S3")
      URL = await createShareableLink({
        extension: `.${fileType === "fwbundle" ? "gfwbundle" : "zip"}`,
        body: file
      });
    }

    if (email) SparkpostService.sendMail(email, URL);

    const newURL = new BucketURLModel({ id: id, URL: URL });
    newURL.save();
  } catch (error) {
    const newURL = new BucketURLModel({ id: id, URL: error });
    newURL.save();
  }
};

class AnswerRouter {
  static async getUrl(ctx) {
    let id = ctx.request.params.id;
    let URL = await BucketURLModel.findOne({ id });
    if (URL) {
      ctx.body = { data: URL.URL };
      BucketURLModel.deleteMany({ id: id });
    } else ctx.body = { data: null };
    ctx.status = 200;
  }

  static async export(ctx) {
    const objId = new ObjectId();
    ctx.templates.forEach(template => {
      if (!template.attributes.languages.includes(ctx.request.body.language))
        ctx.throw(400, "Please enter a valid language for all templates");
    });
    if (!["csv", "fwbundle", "geojson", "shp", "pdf"].includes(ctx.request.body.fileType))
      ctx.throw(400, "Please enter a valid file type");

    exportFunction(
      objId,
      ctx.payload,
      ctx.request.body.fields,
      ctx.templates,
      ctx.request.body.language,
      ctx.request.body.fileType,
      ctx.request.body.email
    );

    ctx.body = { data: objId };
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

router.get("/:id", isAuthenticatedMiddleware, AnswerRouter.getUrl);
router.post("/exportSome", isAuthenticatedMiddleware, getAnswerSet, getTemplates, AnswerRouter.export);
router.post("/exportAll", isAuthenticatedMiddleware, getAllAnswers, getTemplates, AnswerRouter.export);

export default router;
