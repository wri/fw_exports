const axios = require("axios");
const config = require("config");
const response_error = require("../responses/response.error");

class LoggedInUserService {
  async setLoggedInUser(ctx, logger) {
    try {
      await this.getLoggedUser(ctx, logger);
    } catch (getLoggedUserError) {
      if (getLoggedUserError instanceof response_error.ResponseError) {
        ctx.response.status = getLoggedUserError.statusCode;
        ctx.response.body = getLoggedUserError.error;
        return;
      } else {
        ctx.throw(500, `Error loading user info from token - ${getLoggedUserError.toString()}`);
      }
    }
  }

  async getLoggedUser(ctx, logger) {
    var _a;
    logger.debug("[getLoggedUser] Obtaining loggedUser for token");
    if (!ctx.request.header.authorization) {
      logger.debug("[getLoggedUser] No authorization header found, returning");
      return;
    }
    try {
      this.token = ctx.request.header.authorization;
      let baseURL = config.get("controlTower.url");
      const getUserDetailsRequestConfig = {
        method: "GET",
        baseURL,
        url: `/auth/user/me`,
        headers: {
          authorization: ctx.request.header.authorization
        }
      };
      const response = await axios.default(getUserDetailsRequestConfig);
      logger.debug("[getLoggedUser] Retrieved token data, response status:", response.status);
      if (["GET", "DELETE"].includes(ctx.request.method.toUpperCase())) {
        ctx.request.query = {
          ...ctx.request.query,
          loggedUser: JSON.stringify(response.data)
        };
      } else if (["POST", "PATCH", "PUT"].includes(ctx.request.method.toUpperCase())) {
        ctx.request.body.loggedUser = response.data;
        ctx.request.body.token = ctx.request.header.authorization;
      }
    } catch (err) {
      logger.error("Error getting user data", err);
      if ((_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.data) {
        throw new response_error.ResponseError(err.response.status, err.response.data, err.response);
      }
      throw err;
    }
  }
}

module.exports = new LoggedInUserService();
