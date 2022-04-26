import Koa from "koa";
import config from "config";
import logger from "./logger";
import loaderRoutes from "./loaderRoutes";

const app = new Koa();

loaderRoutes(app);

const port = config.get("service.port");
const server = app.listen(port, () => logger.debug("Listening on PORT: %s", port));

export default server;
