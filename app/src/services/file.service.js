const { parse } = require("json2csv");

class FileService {
  static createCsv(payload, fields) {
    // fields is an array of accepted fields
    // payload is an array of objects

    // flatten object
    payload.forEach(record => {
      for (const property in record.attributes) {
        record[property] = record.attributes[property];
      }
    });

    // flatten arrays to strings

    const opts = { fields };
    const csv = parse(payload, opts);
    return csv;
  }

  static createBundle(payload, fields) {
    return null;
  }
}

module.exports = FileService;
