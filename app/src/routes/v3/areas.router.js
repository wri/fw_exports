// body of post requests look like:
// {
//  language: "en"
//  fileType: csv, fwbundle
//  fields: [ fields ]
// }

const logger = require("logger").default;
const Router = require("koa-router");
const AreaService = require("../../services/areas.service");
const FileService = require("../../services/areaFile.service");
import createShareableLink from "services/s3.service";
const BucketURLModel = require("../../models/bucketURL.model");
const { ObjectId } = require("mongoose").Types;
const SparkpostService = require("../../services/sparkpost.service");
const AdmZip = require("adm-zip");

const router = new Router({
  prefix: "/exports/areas"
});

const exportFunction = async (id, payload, fields, fileType, email) => {
  let file = "";

  try {
    // create file
    switch (fileType) {
      case "geojson":
        file = await FileService.createGeojson(payload, fields);
        break;
      case "shp":
        file = await FileService.createShape(payload, fields);
        break;
      case "fwbundle":
        file = await FileService.createBundle(payload);
        break;
      case "csv":
        file = await FileService.createCsv(payload, fields);
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

class AreaRouter {
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
    if (!["csv", "fwbundle", "geojson", "shp"].includes(ctx.request.body.fileType))
      ctx.throw(400, "Please enter a valid file type");
    const fields = ctx.request.body.fields || [];

    const objId = new ObjectId();

    exportFunction(objId, ctx.payload, fields, ctx.request.body.fileType, ctx.request.body.email);

    ctx.body = { data: objId };
    ctx.status = 200;
  }
}

const getArea = async (ctx, next) => {
  const area = await AreaService.getArea(ctx.request.params.areaid);
  if (!area) ctx.throw(404, "This area doesn't exist");
  else ctx.payload = [area];
  await next();
};

const getAreas = async (ctx, next) => {
  const areas = await AreaService.getAreas();
  if (!areas) ctx.throw(404, "Something went wrong");

  // go through areas and remove duplicates
  let uniqueAreas = [];
  areas.forEach(area => {
    // find that area in unique area array
    let existingArea = uniqueAreas.find(uniqueArea => uniqueArea.id.toString() === area.id.toString());
    if (!existingArea) uniqueAreas.push(area);
  });

  ctx.payload = uniqueAreas;
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

router.get("/:id", isAuthenticatedMiddleware, AreaRouter.getUrl);
router.post("/exportOne/:areaid", isAuthenticatedMiddleware, getArea, AreaRouter.export);
router.post("/exportAll", isAuthenticatedMiddleware, getAreas, AreaRouter.export);

export default router;
