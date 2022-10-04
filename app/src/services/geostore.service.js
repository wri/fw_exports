const loggedInUserService = require("./LoggedInUserService");
const deserializer = require("serializers/deserializer");
import config from "config";
import logger from "../logger";
import axios from "axios";

class GeostoreService {
  static async getGeostore(geostoreId) {
    logger.info("Getting geostore with id", geostoreId);
    try {
      let baseURL = config.get("geostoreAPI.url");
      const response = await axios.default({
        baseURL,
        url: `/geostore/${geostoreId}`,
        method: "GET",
        headers: {
          authorization: loggedInUserService.token
        }
      });
      const geostore = response.data;
      logger.info("Got geostore", geostore);
      return deserializer(geostore);
    } catch (e) {
      logger.error("Error while fetching geostore", e);
      throw e;
    }
  }
}
module.exports = GeostoreService;
