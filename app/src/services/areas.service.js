import config from "config";
import logger from "../logger";
import axios from "axios";
const loggedInUserService = require("./LoggedInUserService");

class AreaService {
  static async getArea(areaId) {
    logger.info(`Getting area with id ${areaId}`);
    try {
      const baseURL = config.get("areasAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/areas/${areaId}`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const area = response.data;
      logger.info("Got area", area);
      return area && area.data;
    } catch (e) {
      logger.error("Error while fetching area", e);
    }
  }

  static async getAreas() {
    logger.info(`Getting areas`);
    try {
      const baseURL = config.get("areasAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/areas/userAndTeam`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const areas = response.data;
      logger.info("Got areas", areas);
      return areas && areas.data;
    } catch (e) {
      logger.error("Error while fetching areas", e);
      return null; // log the error but still return
    }
  }
}
module.exports = AreaService;
