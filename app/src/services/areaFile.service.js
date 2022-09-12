const archiver = require("archiver");
const streamBuffers = require("stream-buffers");
const AlertService = require("./alerts.service");
//const ConvertService = require("./convert.service");
const { parse } = require("json2csv");
const shpwrite = require("shp-write");
const GeostoreService = require("./geostore.service");

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
    try {
      

    // loop over records
    for await (const record of payload) {
      const newRecord = {
        ...record.attributes,
        id: record.id
      };
      delete newRecord.reportTemplate;

      if(!record.attributes.geostore.geojson) {
        let geojsonResponse = await GeostoreService.getGeostore(record.attributes.geostore);
        newRecord.geostore = geojsonResponse;
      }

      // get alerts for each area dataset
      for await (const dataset of newRecord.datasets) {
        // get alerts
        const alerts = await AlertService.getAlerts(dataset.slug, newRecord.geostore.id);
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
  } catch (error) {
      console.log(error)
      throw error
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

  static async createGeojson(payload, fields = []) {
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
      type: 'FeatureCollection',
      features: []
    };

    // loop over records
    for await (const record of payload) {
      let geojson;
      // pull down geojson info
      if (!record.attributes.geostore.geojson) {
        let geojsonResponse = await GeostoreService.getGeostore(record.attributes.geostore);
        geojson = geojsonResponse.geojson;
        geojson.features.forEach(feature => {
          feature.properties = {
            id: record.id,
          };
          fields.forEach(field => feature.properties[field] = record.attributes[field])
          geojsonFile.features.push(feature)
        });
        archive.append(JSON.stringify(geojson), { name: `${record.attributes.name}${record.id}.geojson` });
      } else if (record.attributes.geostore.geojson) {
        geojson = record.attributes.geostore.geojson;
        geojson.features.forEach(feature => {
          feature.properties = {
            id: record.id,
          };
          fields.forEach(field => feature.properties[field] = record.attributes[field])
          geojsonFile.features.push(feature)
        });
      }
    }
    archive.append(JSON.stringify(geojsonFile), { name: `areas.geojson` });
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
      let geojson;
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

/*  // loop over records
    for await (const record of payload) {
      let geojson;
      if (!record.attributes.geostore.geojson) {
        let geojsonResponse = await GeostoreService.getGeostore(record.attributes.geostore);
        geojson = geojsonResponse.geojson;
        console.log(geojson)
        geojson.features.forEach(feature => {
          feature.properties = {
            id: `id: ${record.id.toString()}`,
            name: `name: ${record.attributes.name.toString()}`,
            createdAt: `createdAt: ${record.attributes.createdAt.toString()}`,
            image: `image: ${record.attributes.image.toString()}`
          };
        });
        let shpfile = shpwrite.zip(geojson);
        //let shpfile = await ConvertService.geojsonToShp(geojson)
        archive.append(shpfile, { name: `${record.attributes.name}${record.id}.zip` });
      }
      if (record.attributes.geostore.geojson) {
        geojson = record.attributes.geostore.geojson;
        console.log(geojson)
        geojson.features.forEach(feature => {
          feature.properties = {
            id: `id: ${record.id.toString()}`,
            name: `name: ${record.attributes.name.toString()}`,
            createdAt: `createdAt: ${record.attributes.createdAt.toString()}`,
            image: `image: ${record.attributes.image.toString()}`
          };
        });

        let shpfile = shpwrite.zip(geojson);
        //let shpfile = await ConvertService.geojsonToShp(geojson)
        archive.append(shpfile, { name: `${record.attributes.name}${record.id}.zip` });
      }
    } */
    let shapeArray = {
      type: 'FeatureCollection',
      features: []
    };
    for await (const record of payload) {
      let geojson;
      if (!record.attributes.geostore.geojson) {
        let geojsonResponse = await GeostoreService.getGeostore(record.attributes.geostore);
        geojson = geojsonResponse.geojson;
        geojson.features.forEach(feature => {
          feature.properties = {
            id: `id: ${record.id.toString()}`,
            name: `name: ${record.attributes.name.toString()}`,
            createdAt: `createdAt: ${record.attributes.createdAt.toString()}`,
            image: `image: ${record.attributes.image.toString()}`
          };
        });
        shapeArray.features.push(...geojson.features)
        //let shpfile = shpwrite.zip(geojson);
        //let shpfile = await ConvertService.geojsonToShp(geojson)
        //archive.append(shpfile, { name: `${record.attributes.name}${record.id}.zip` });
      }
      if (record.attributes.geostore.geojson) {
        geojson = record.attributes.geostore.geojson;
        geojson.features.forEach(feature => {
          feature.properties = {
            id: `id: ${record.id.toString()}`,
            name: `name: ${record.attributes.name.toString()}`,
            createdAt: `createdAt: ${record.attributes.createdAt.toString()}`,
            image: `image: ${record.attributes.image.toString()}`
          };
        });
        shapeArray.features.push(...geojson.features)
        //let shpfile = shpwrite.zip(geojson);
        //let shpfile = await ConvertService.geojsonToShp(geojson)
        //archive.append(shpfile, { name: `${record.attributes.name}${record.id}.zip` });
      }
    } 
    let shpfile = shpwrite.zip(shapeArray);
    archive.append(shpfile, { name: `areas.zip` });
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
