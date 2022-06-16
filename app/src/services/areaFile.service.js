const archiver = require("archiver");
const streamBuffers = require("stream-buffers");
const AlertService = require("./alerts.service");

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
}

module.exports = FileService;
