const archiver = require("archiver");
const streamBuffers = require("stream-buffers");
const AlertService = require("./alerts.service");
//const ConvertService = require("./convert.service");
const { parse } = require("json2csv");
const shpwrite = require("shp-write");

class FileService {
  static async createBundle(payload) {
    // create a fwbundle
    let bundle = {
      version: 2,
      timestamp: new Date().getTime(),
      alerts: [],
      areas: [],
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

    // loop over records
    for await (const record of payload) {
      const newRecord = {
        ...record.attributes,
        id: record.id
      };
      delete newRecord.reportTemplate;

      // get alerts for each area dataset
      for await (const dataset of newRecord.datasets) {
        // get alerts
        const alerts = await AlertService.getAlerts(dataset.slug, newRecord.geostore.id);
        //console.log(typeof)
        bundle.alerts.push(
          ...alerts.map(alert => {
            return {
              areaId: newRecord.id,
              slug: dataset.slug,
              long: alert.longitude,
              lat: alert.latitude,
              date: alert.date,
              confidence: alert.confidence
            };
          })
        );
      }

      bundle.areas.push(newRecord);
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

    // loop over records
    for await (const record of payload) {
      let geojson = record.attributes.geostore.geojson;
      geojson.attributes = {
        id: record.id,
        name: record.attributes.name,
        createdAt: record.attributes.createdAt,
        image: record.attributes.image
      };

      // save each geojson as new file
      archive.append(JSON.stringify(geojson), { name: `${record.attributes.name}${record.id}.geojson` });
    }

    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(contents);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }

  static async createCsv(payload, fields) {
    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);
    let areas = [];
    // loop over records
    for await (const record of payload) {
      let row = {
        id: record.id,
        name: record.attributes.name,
        createdAt: record.attributes.createdAt,
        image: record.attributes.image
      };

      fields.forEach(field => {
        if (record.attributes[field]) row[field] = record.attributes[field];
      });

      // format geojson data
      let geojson = record.attributes.geostore.geojson;
      geojson.features.forEach((feature, index) => {
        let featureName = "feature" + index.toString();
        // turn coordinates into simpler array
        let simpleCoords = feature.geometry.coordinates[0].map(coords => `${coords[0]} ${coords[1]}`);
        let wkt = `${feature.geometry.type.toUpperCase()}((${simpleCoords.join(",")}))`;
        row[featureName] = wkt;
        if (!fields.includes(featureName)) fields.push(featureName);
      });

      areas.push(row);
    }
    fields.unshift("id", "name", "createdAt", "image");
    const opts = { fields };
    const csv = parse(areas, opts);
    archive.append(csv, { name: "areas.csv" });
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
    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);

    // loop over records
    for await (const record of payload) {
      let geojson = record.attributes.geostore.geojson;
      geojson.attributes = {
        id: record.id,
        name: record.attributes.name,
        createdAt: record.attributes.createdAt,
        image: record.attributes.image
      };

      let shpfile = shpwrite.zip(geojson);
      //let shpfile = await ConvertService.geojsonToShp(geojson)
      archive.append(shpfile, { name: `${record.attributes.name}${record.id}.zip` });
    }

    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(contents);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }
}

module.exports = FileService;
