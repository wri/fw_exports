/* eslint-disable prettier/prettier */
import logger from "../logger";
import axios from "axios";
import querystring from "querystring";
//import admZip from "adm-zip";

class ConvertService {
  static async geojsonToShp(geojson) {
    logger.info(`Converting geojson ${{ ...geojson }}`);
    try {
      const response = await axios.post(
        `http://ogre.adc4gis.com/convertJson`,
        querystring.stringify({ json: JSON.stringify(geojson) }),
        {headers: {'content-type': 'application/x-www-form-urlencoded'}, responseType: "arraybuffer"}
      );
      const shp = response.data;

/*       // unzip and rezip?
      const rezip = new admZip();
      rezip.addFile("other.shz", shp)

      const shpToWrite = rezip.toBuffer();

      logger.info("Got shapefile"); */
      return shp;
    } catch (e) {
      logger.error("Error while converting shapefile", e);
    }
  }
}

module.exports = ConvertService;
