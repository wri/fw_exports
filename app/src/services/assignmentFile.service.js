const { parse } = require("json2csv");
const archiver = require("archiver");
const streamBuffers = require("stream-buffers");
const ConvertService = require("./convert.service");
const GeostoreService = require("./geostore.service");
import axios from "axios";

const allowedFields = [
  "id",
  "name",
  "location",
  "priority",
  "monitors",
  "notes",
  "status",
  "areaId",
  "templateIds",
  "createdAt",
  "createdBy",
  "areaName",
  "geostore"
];

class AssignementsFileService {
  static async createBundle(payload) {
    // create a fwbundle
    let bundle = {
      version: 2,
      timestamp: new Date().getTime(),
      alerts: [],
      areas: [],
      assignments: [],
      basemaps: [],
      layers: [],
      routes: [],
      templates: {},
      reports: [],
      manifest: {
        layerFiles: [],
        reportFiles: []
      }
    };

    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);
    try {
      // loop over records
      for await (const record of payload) {
        const newRecord = {
          ...record.attributes,
          id: record.id
        };

        if (typeof record.attributes.geostore === "string") {
          let geojsonResponse = await GeostoreService.getGeostore(record.attributes.geostore);
          newRecord.geostore = geojsonResponse;
        }

        if (record.attributes.image && record.attributes.image.startsWith("https://s3.amazonaws.com")) {
          const imageURL = record.attributes.image;
          if (payload.length < 20) {
            // download the file
            const file = await axios({
              url: imageURL,
              responseType: "stream",
              responseEncoding: "utf-8"
            });
            const fileName = imageURL;
            const [fileExtension] = fileName.split(".").slice(-1);
            // save it to the directory - directory name should be name of report/name of question
            const filePath = `${record.attributes.name}/attachment.${fileExtension}`;
            record.attributes.image = filePath;
            archive.append(file.data, { name: filePath });
          }
        }

        bundle.assignments.push(newRecord);
      }
    } catch (error) {
      console.log(error);
      throw error;
    }

    archive.append(JSON.stringify(bundle), { name: "bundle.json" });
    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(contents);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }

  static async createGeojson(payload) {
    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);

    let geojsonFile = {
      type: "FeatureCollection",
      features: []
    };

    // loop over records
    for await (const record of payload) {
      let geojson;
      console.log(record, record.attributes.geostore, record.attributes.location);
      if (record.attributes.geostore) {
        // pull down geojson info
        if (!record.attributes.geostore.geojson) {
          let geojsonResponse = await GeostoreService.getGeostore(record.attributes.geostore);
          geojson = { ...geojsonResponse.geojson };
          geojson.features.forEach(feature => {
            feature.properties = {
              id: record.id,
              ...record.attributes,
              geostore: null
            };
            geojsonFile.features.push(feature);
          });
        } else if (record.attributes.geostore.geojson) {
          geojson = { ...record.attributes.geostore.geojson };
          geojson.features.forEach(feature => {
            feature.properties = {
              id: record.id,
              ...record.attributes,
              geostore: null
            };
            geojsonFile.features.push(feature);
          });
        }
      } else if (record.attributes.location && Array.isArray(record.attributes.location)) {
        record.attributes.location.forEach(location => {
          const feature = {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [location.lat, location.lon]
            },
            properties: {
              id: record.id,
              ...record.attributes,
              alertType: location.alertType,
              location: null
            }
          };
          geojsonFile.features.push(feature);
        });
      }
    }
    archive.append(JSON.stringify(geojsonFile), { name: `assignments.geojson` });
    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(contents);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }

  static async createCsv(payload, requestedFields) {
    // sanitise fields
    const fields = requestedFields.reduce((fieldsArray, currentField) => {
      if (allowedFields.includes(currentField)) fieldsArray.push(currentField);
      return fieldsArray;
    }, []);

    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);
    let assignments = [];
    // loop over records
    for await (const record of payload) {
      let row = {
        id: record.id,
        ...record.attributes
      };

      let geojson;
      if (record.attributes.geostore) {
        if (!record.attributes.geostore.geojson) {
          let geojsonResponse = await GeostoreService.getGeostore(record.attributes.geostore);
          geojson = geojsonResponse.geojson;
          if (geojson.features) {
            geojson.features.forEach((feature, index) => {
              let featureName = "feature" + index.toString();
              // turn coordinates into simpler array
              let simpleCoords = feature.geometry.coordinates[0].map(coords => `${coords[0]} ${coords[1]}`);
              let wkt = `${feature.geometry.type.toUpperCase()}((${simpleCoords.join(",")}))`;
              row[featureName] = wkt;
              if (!fields.includes(featureName)) fields.push(featureName);
            });
          }
        }
        // format geojson data
        else if (record.attributes.geostore.geojson) {
          geojson = record.attributes.geostore.geojson;
          geojson.features.forEach((feature, index) => {
            let featureName = "feature" + index.toString();
            // turn coordinates into simpler array
            let simpleCoords = feature.geometry.coordinates[0].map(coords => `${coords[0]} ${coords[1]}`);
            let wkt = `${feature.geometry.type.toUpperCase()}((${simpleCoords.join(",")}))`;
            row[featureName] = wkt;
            if (!fields.includes(featureName)) fields.push(featureName);
          });
        }
      }
      assignments.push(row);
    }
    const opts = { fields };
    const csv = parse(assignments, opts);
    archive.append(csv, { name: "assignments.csv" });
    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(contents);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }

  static async createShape(payload) {
    // sanitise fields

    let shapeArray = {
      type: "FeatureCollection",
      features: []
    };
    for await (const record of payload) {
      let geojson;
      if (record.attributes.geostore) {
        if (!record.attributes.geostore.geojson) {
          let geojsonResponse = await GeostoreService.getGeostore(record.attributes.geostore);
          geojson = geojsonResponse.geojson;
          geojson.features.forEach(feature => {
            feature.properties = {
              id: record.id.toString(),
              ...Object.values(record.attributes).map(attribute => {
                if (typeof attribute === "object") return JSON.stringify(attribute);
                else return attribute;
              })
            };
          });
          shapeArray.features.push(...geojson.features);
        }
        if (record.attributes.geostore.geojson) {
          geojson = record.attributes.geostore.geojson;
          geojson.features.forEach(feature => {
            feature.properties = {
              id: record.id.toString(),
              ...Object.values(record.attributes).map(attribute => {
                if (typeof attribute === "object") return JSON.stringify(attribute);
                else return attribute;
              })
            };
          });
          shapeArray.features.push(...geojson.features);
        }
      } else if (record.attributes.location && Array.isArray(record.attributes.location)) {
        record.attributes.location.forEach(location => {
          const feature = {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [location.lat, location.lon]
            },
            properties: {
              id: record.id,
              ...record.attributes,
              alertType: location.alertType,
              location: null
            }
          };
          shapeArray.features.push(feature);
        });
      }
    }
    let shpfile = await ConvertService.geojsonToShp(shapeArray);

    return shpfile;
  }
}
module.exports = AssignementsFileService;
