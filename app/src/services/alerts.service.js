import config from "config";
import logger from "../logger";
import axios from "axios";
const csv = require("csvtojson");

class AlertService {
  static async getAlerts(dataset, geostoreId) {
    logger.info(`Getting alerts for dataset ${dataset} and geostore ${geostoreId}`);

    // build url and query
    const datasets = {
      umd_as_it_happens: {
        datastoreId: "umd_glad_landsat_alerts",
        query: {
          confidenceKey: "umd_glad_landsat_alerts__confidence",
          dateKey: "umd_glad_landsat_alerts__date",
          requiresMaxDate: true,
          tableName: "umd_glad_landsat_alerts"
        }
      },
      glad_sentinel_2: {
        datastoreId: "umd_glad_sentinel2_alerts",
        query: {
          confidenceKey: "umd_glad_sentinel2_alerts__confidence",
          dateKey: "umd_glad_sentinel2_alerts__date",
          requiresMaxDate: true,
          tableName: "umd_glad_sentinel2_alerts"
        }
      },
      wur_radd_alerts: {
        datastoreId: "wur_radd_alerts",
        query: {
          confidenceKey: "wur_radd_alerts__confidence",
          dateKey: "wur_radd_alerts__date",
          requiresMaxDate: true,
          tableName: "wur_radd_alerts"
        }
      },
      viirs: {
        datastoreId: "nasa_viirs_fire_alerts",
        query: {
          dateKey: "alert__date",
          requiresMaxDate: false,
          tableName: "mytable"
        }
      }
    };

    let apiConfig = datasets[dataset];
    if (!apiConfig) throw "Invalid dataset";
    const { dateKey, confidenceKey, tableName } = apiConfig.query;

    let url = `/dataset/${
      apiConfig.datastoreId
    }/latest/query/csv?format=json&geostore_origin=rw&geostore_id=${geostoreId}&sql=select latitude, longitude, ${dateKey} as "date" ${
      confidenceKey ? ", " + confidenceKey + ` as "confidence"` : ""
    } from ${tableName} ORDER BY ${dateKey} DESC LIMIT 1000`;

    try {
      const baseURL = config.get("alertsAPI.url");
      const response = await axios.default({
        baseURL,
        url,
        method: "GET",
        headers: {
          "x-api-key": config.get("gfwApiKey.apiKey")
        }
      });

      const alerts = response.data;

      return alerts ? await csv().fromString(alerts) : [];
    } catch (e) {
      logger.error("Error while fetching alerts", e);
      return []; // log the error but still return
    }
  }
}
module.exports = AlertService;
