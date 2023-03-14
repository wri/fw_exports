import Koa from "koa";
import config from "config";
const cors = require("@koa/cors");
import logger from "./logger";
import loaderRoutes from "./loaderRoutes";
import LoggedInUserService from "./services/LoggedInUserService";
const mongoose = require("mongoose");
mongoose.Promise = Promise;
const koaBody = require("koa-body")({
  multipart: true,
  jsonLimit: "50mb",
  formLimit: "50mb",
  textLimit: "50mb"
});

const app = new Koa();
app.use(cors());

app.use((ctx, next) => {
  return next().then(function () {
    ctx.set("Cache-Control", "private");
  });
});
app.use(koaBody);

let dbSecret = config.get("mongodb.secret");
if (typeof dbSecret === "string") {
  dbSecret = JSON.parse(dbSecret);
}

const mongoURL =
  "mongodb://" +
  `${dbSecret.username}:${dbSecret.password}` +
  `@${config.get("mongodb.host")}:${config.get("mongodb.port")}` +
  `/${config.get("mongodb.database")}` +
  "?authSource=admin";

const onDbReady = err => {
  if (err) {
    logger.error(err);
    throw new Error(err);
  }
};

mongoose.connect(mongoURL, onDbReady);

app.use(async (ctx, next) => {
  await LoggedInUserService.setLoggedInUser(ctx, logger);
  await next();
});

loaderRoutes(app);

const port = config.get("service.port");
const server = app.listen(port, () => logger.debug("Listening on PORT: %s", port));

export default server;
