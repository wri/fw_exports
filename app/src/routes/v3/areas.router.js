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

const router = new Router({
  prefix: "/exports/areas"
});

class AreaRouter {
  static async export(ctx) {
    let file = "";

    const fields = ctx.request.body.fields || [];

    // create file
    switch (ctx.request.body.fileType) {
      case "geojson":
        file = await FileService.createGeojson(ctx.payload);
        break;
      case "shp":
        file = await FileService.createShape(ctx.payload);
        break;
      case "fwbundle":
        file = await FileService.createBundle(ctx.payload);
        break;
      case "csv":
        file = await FileService.createCsv(ctx.payload, fields);
        break;
      default:
        ctx.throw(400, "Please enter a valid file type (csv, geojson, fwbundle)");
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

const getArea = async (ctx, next) => {
  const area = await AreaService.getArea(ctx.request.params);
  if (!area) ctx.throw(404, "This area doesn't exist");
  else ctx.payload = area;
  await next();
};

const getAreas = async (ctx, next) => {
  const areas = await AreaService.getAreas(ctx.request.params);
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

router.post("/exportOne/:areaid", isAuthenticatedMiddleware, getArea, AreaRouter.export);
router.post("/exportAll", isAuthenticatedMiddleware, getAreas, AreaRouter.export);

export default router;
