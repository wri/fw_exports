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

const router = new Router({
  prefix: "/exports/areas"
});

const exportFunction = async (id, payload, fields, fileType) => {
  let file = "";

  try {
    // create file
    switch (fileType) {
      case "geojson":
        file = await FileService.createGeojson(payload);
        break;
      case "shp":
        file = await FileService.createShape(payload);
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

    // read the zip file and upload to s3 bucket
    const URL = await createShareableLink({
      extension: `.${fileType === "fwbundle" ? "fwbundle" : "zip"}`,
      body: file
    });

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

    exportFunction(objId, ctx.payload, fields, ctx.request.body.fileType);

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
  ctx.payload = areas;
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
