import fs from "fs";
import Koa from "koa";
import logger from "./logger";
import mount from "koa-mount";

const routersPath = `${__dirname}/routes`;

const requireESModuleDefault = (path: string) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const module = require(path);
  return module.__esModule ? module.default : module;
};

const loadAPI = (app: Koa, path: string, pathApi?: string) => {
  const routesFiles = fs.readdirSync(path);

  let existIndexRouter = false;
  routesFiles.forEach(file => {
    const newPath = path ? `${path}/${file}` : file;
    const stat = fs.statSync(newPath);
    if (!stat.isDirectory()) {
      if (file.lastIndexOf(".router.js") !== -1 || file.lastIndexOf(".router.ts") !== -1) {
        if (file === "index.router.ts" || file === "index.router.ts") {
          existIndexRouter = true;
        } else {
          logger.debug("Loading route %s, in path %s", newPath, pathApi);
          if (pathApi) {
            app.use(mount(pathApi, requireESModuleDefault(newPath).middleware()));
          } else {
            app.use(requireESModuleDefault(newPath).middleware());
          }
        }
      }
    } else {
      // is folder
      const newPathAPI = pathApi ? `${pathApi}/${file}` : `/${file}`;
      loadAPI(app, newPath, newPathAPI);
    }
  });
  if (existIndexRouter) {
    // load index.router.ts when finished other Routers
    const newPath = path ? `${path}/index.router` : "index.router";
    logger.debug("Loading route %s, in path %s", newPath, pathApi);
    if (pathApi) {
      app.use(mount(pathApi, requireESModuleDefault(newPath).middleware()));
    } else {
      app.use(requireESModuleDefault(newPath).middleware());
    }
  }
};

export default (app: Koa) => {
  logger.debug("Loading routes...");
  loadAPI(app, routersPath);
  logger.debug("Loaded routes correctly!");
};
