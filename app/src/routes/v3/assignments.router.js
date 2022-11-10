// body of post requests look like:
// {
//  language: "en"
//  fileType: csv, fwbundle
//  fields: [ fields ]
// }

const logger = require("logger").default;
const Router = require("koa-router");
const AssignmentsFileService = require("../../services/assignmentFile.service");
import createShareableLink from "services/s3.service";
const BucketURLModel = require("../../models/bucketURL.model");
const { ObjectId } = require("mongoose").Types;
const SparkpostService = require("../../services/sparkpost.service");
const AdmZip = require("adm-zip");
const AssignmentService = require("../../services/assignments.service");

const router = new Router({
  prefix: "/exports/assignments"
});

const exportFunction = async (id, payload, fields, fileType, email) => {
  let file = "";

  try {
    // create file
    switch (fileType) {
      case "geojson":
        file = await AssignmentsFileService.createGeojson(payload, fields);
        break;
      case "shp":
        file = await AssignmentsFileService.createShape(payload, fields);
        break;
      case "csv":
        file = await AssignmentsFileService.createCsv(payload, fields);
        break;
      case "fwbundle":
        file = await AssignmentsFileService.createBundle(payload);
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
    await newURL.save();
  } catch (error) {
    const newURL = new BucketURLModel({ id: id, URL: error });
    await newURL.save();
  }
};

class AssignmentRouter {
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

    exportFunction(objId, ctx.payload, ctx.request.body.fields, ctx.request.body.fileType, ctx.request.body.email);

    ctx.body = { data: objId };
    ctx.status = 200;
  }
}

const getAssignmentSet = async (ctx, next) => {
  const { ids } = ctx.request.body;
  let assignments = [];
  for await (const id of ids) {
    const assignment = await AssignmentService.getAssignment(id);
    if (!assignment) ctx.throw(404, "Some assignments don't exist");
    else assignments.push(assignment);
  }
  ctx.payload = assignments;
  await next();
};

const getAllAssignments = async (ctx, next) => {
  const assignments = await AssignmentService.getAllAssignments();
  ctx.payload = assignments;
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

router.get("/:id", isAuthenticatedMiddleware, AssignmentRouter.getUrl);
router.post("/exportSome", isAuthenticatedMiddleware, getAssignmentSet, AssignmentRouter.export);
router.post("/exportAll", isAuthenticatedMiddleware, getAllAssignments, AssignmentRouter.export);

export default router;
