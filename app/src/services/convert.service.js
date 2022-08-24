import logger from "../logger";
import axios from "axios";

class ConvertService {
  static async geojsonToShp(geojson) {
    logger.info(`Converting geojson ${geojson}`);
    try {
      const response = await axios.post(`http://ogre.adc4gis.com/convertJson`, JSON.stringify({ json: geojson }));
      const shp = response.data;
      logger.info("Got shapefile");
      return shp;
    } catch (e) {
      logger.error("Error while converting shapefile", e);
    }
  }
}

module.exports = ConvertService;
