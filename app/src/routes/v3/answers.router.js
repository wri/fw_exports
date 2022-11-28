// body of post requests look like:
// {
//  language: "en"
//  fileType: csv, fwbundle
//  fields: [ fields ]
// }

const logger = require("logger").default;
const Router = require("koa-router");
const { AnswerService } = require("../../services/answers.service");
const ReportFileService = require("../../services/reportFile.service");
const { FileService } = require("../../services/file.service");
import createShareableLink from "services/s3.service";
const BucketURLModel = require("../../models/bucketURL.model");
const { ObjectId } = require("mongoose").Types;
const SparkpostService = require("../../services/sparkpost.service");
const AdmZip = require("adm-zip");
const axios = require("axios");

const router = new Router({
  prefix: "/exports/reports"
});

const exportFunction = async (id, payload, fields, templates, language, fileType, email) => {
  let file = "";

  // create file
  switch (fileType) {
    case "geojson":
      file = await ReportFileService.createGeojson(payload);
      break;
    case "shp":
      file = await ReportFileService.createShape(payload, fields);
      break;
    case "csv":
      file = await ReportFileService.createCsv(payload, fields, templates, language);
      break;
    case "fwbundle":
      file = await ReportFileService.createBundle(payload, templates);
      break;
    case "pdf":
      file = await ReportFileService.createPDF(payload, templates, fields, language);
      break;
    default:
      break;
  }

  let URL = "";
  if (fileType === "shp") {
    const zip = new AdmZip(file);
    // read the zip file and upload to s3 bucket
    URL = await createShareableLink({
      extension: `.zip`,
      body: zip.toBuffer()
    });
  } else {
    // read the zip file and upload to s3 bucket
    logger.info("Uploading to S3");
    URL = await createShareableLink({
      extension: `.${fileType === "fwbundle" ? "gfwbundle" : "zip"}`,
      body: file
    });
  }

  if (email) SparkpostService.sendMail(email, URL);

  const newURL = new BucketURLModel({ id: id, URL: URL });
  newURL.save();
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
    /*     ctx.templates.forEach(template => {
      if (!template.attributes.languages.includes(ctx.request.body.language))
        ctx.throw(400, "Please enter a valid language for all templates");
    }); */
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

  /**
   * Exports the images of a given report
   * @param {import("koa").Context & {params: {id?: string}}} ctx
   */
  static async exportImages(ctx) {
    const answerId = ctx.params.id;
    if (answerId === undefined) {
      ctx.throw(400, "Answer id is required");
    }

    const fileType = ctx.request.body.fileType;
    if (!["zip", "pdf"].includes(fileType)) {
      ctx.throw(400, "File type must be pdf or zip");
    }

    const answer = await AnswerService.getAnswer({
      reportid: answerId,
      templateid: answerId
    });
    if (!answer) {
      ctx.throw(404, "Report not found");
    }
    const responses = answer.attributes.responses;

    const templateId = answer.attributes.report;
    const template = await AnswerService.getTemplate(templateId);
    const questions = template.attributes.questions;

    // Flatten the array of questions so questions and child questions are at the same nesting and get their type
    const flatQuestionTypes = questions.reduce((acc, question) => {
      return [...acc, question.type, ...question.childQuestions.map(q => q.type)];
    }, []);

    const isImageType = type => type === "blob";
    const imageResponses = flatQuestionTypes
      .reduce((acc, type, i) => {
        if (isImageType(type)) {
          return [...acc, i];
        }
        return acc;
      }, [])
      .map(i => responses[i]);

    const imagePromises = [];
    for (const imageResponse of imageResponses) {
      const imageUrls = imageResponse.value ?? [];
      for (const url of imageUrls) {
        imagePromises.push(axios.get(url, { responseType: "arraybuffer" }).then(res => res.data));
      }
    }
    const imageBuffers = await Promise.all(imagePromises);

    let exportBuffer;
    if (fileType === "zip") {
      const imagesArchiveInput = imageBuffers.map((buffer, i) => ({
        data: buffer,
        name: "img-" + i
      }));
      exportBuffer = await FileService.createArchive(imagesArchiveInput);
    }

    if (fileType === "pdf") {
      const imagesPdfInput = imageBuffers.map(buffer => ({
        data: buffer
      }));
      exportBuffer = await FileService.createImagesPDF(answer.attributes.reportName, imagesPdfInput);
    }

    const id = new ObjectId();

    createShareableLink({
      extension: `.${fileType}`,
      body: exportBuffer
    }).then(URL => {
      const URLModel = new BucketURLModel({ id: id, URL: URL });
      URLModel.save();
    });

    ctx.body = { data: id };
    ctx.status = 200;
  }
}

const getAnswerSet = async (ctx, next) => {
  const { ids } = ctx.request.body;
  let answers = [];
  for await (const id of ids) {
    const answer = await AnswerService.getAnswer(id);
    if (!answer) ctx.throw(404, "Some answers don't exist");
    else answers.push(answer);
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
      answer.attributes.templateName = template.attributes.name[ctx.request.body.language];
      templates.push(template);
    } else answer.attributes.templateName = existing.attributes.name[ctx.request.body.language];
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
router.post("/:id/images", isAuthenticatedMiddleware, AnswerRouter.exportImages);

export default router;
