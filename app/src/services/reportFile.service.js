const { parse } = require("json2csv");
const archiver = require("archiver");
import axios from "axios";
const streamBuffers = require("stream-buffers");
//const shpwrite = require("shp-write");
const PDFDocument = require("pdfkit");
const ConvertService = require("./convert.service");
//const GeostoreService = require("./geostore.service");

const allowedFields = ["createdAt", "fullName", "areaOfInterestName", "layer", "userPosition", "clickedPosition"];

class FileService {
  static async createCsv(payload, fields, templates, language) {
    // fields is an array of accepted fields
    // payload is an array of objects

    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);

    // create array of questions. There will be lots of questions depending on the number of templates.
    let questions = [];
    templates.forEach(template => {
      questions.push(...template.attributes.questions);
    });

    // flatten object
    for await (const record of payload) {
      for (const property in record.attributes) {
        let textToPrint = "";
        if (Array.isArray(record.attributes[property])) {
          // if it's coordinates
          if (typeof record.attributes[property][0] === "object") {
            // if it's an array of objects ({lon: number, lat: number})
            if (record.attributes[property].length > 1) {
              textToPrint = "MULTIPOINT (";
              record.attributes[property].forEach(point => {
                textToPrint = textToPrint + `(${point.lon} ${point.lat}), `;
              });
              textToPrint.slice(0, -1);
              textToPrint.slice(0, -1);
              textToPrint = textToPrint + ")";
            } else {
              textToPrint = `POINT (${record.attributes[property][0].lon} ${record.attributes[property][0].lat})`;
            }
          } else {
            // if it's an array of coordinates
            textToPrint = `POINT (${record.attributes[property][0]} ${record.attributes[property][1]})`;
          }
        } else textToPrint = record.attributes[property];
        record[property] = textToPrint;
      }

      if (fields.includes("responses")) {
        // loop over responses
        for await (const response of record.responses) {
          // find the question in questions, if not found, add
          let question = questions.find(question => question.name === response.name);
          if (!question) {
            question = { name: response.name, label: { [language]: response.name } };
            questions.push(question);
          }
          // check if the answer is an image
          if (response.value && response.value.startsWith("https://s3.amazonaws.com")) {
            // download the image
            const image = await axios({
              url: response.value,
              responseType: "stream",
              responseEncoding: "utf-8"
            });
            // save it to the directory - directory name should be name of report/name of question
            const imagePath = `${record.attributes.reportName}/${response.name}/attachment.jpeg`;
            archive.append(image.data, { name: imagePath });
            // add the path to the csv file
            record[question.label[language]] = imagePath;
          } else record[question.label[language]] = response.value;
        }
      }
    }

    // remove "questions" from
    if (fields.includes("responses")) {
      fields.splice(fields.indexOf("responses"), 1);
      fields.push(...questions.map(question => question.label[language]));
    }

    const columnLabels = fields.map(field => {
      if (titles[language][field]) return { label: titles[language][field], value: field };
      else return field;
    });

    const opts = { fields: columnLabels };
    const csv = parse(payload, opts);
    archive.append(csv, { name: "reportAnswers.csv" });
    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(contents);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }

  static async createBundle(payload, templates) {
    // create a fwbundle
    let bundle = {
      version: 2,
      timestamp: new Date().getTime(),
      alerts: [],
      areas: [],
      basemaps: [],
      layers: [],
      routes: [],
      templates: {}, // has the data for the templates
      reports: [], // has the data for the reports,
      manifest: {
        layerFiles: [],
        reportFiles: [] // has the data for report files
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

    // set templates
    templates.forEach(template => {
      bundle.templates[template.id] = template;
    });

    // loop over records
    for await (const record of payload) {
      let newRecord = {
        id: record.id,
        area: {
          id: record.attributes.areaOfInterest,
          name: record.attributes.areaOfInterestName
        },
        reportName: record.attributes.reportName,
        userPosition: record.attributes.userPosition.toString(),
        clickedPosition: JSON.stringify(record.attributes.clickedPosition),
        date: record.attributes.createdAt,
        answers: []
      };

      // loop over answers
      for await (const response of record.attributes.responses) {
        let answer = {
          value: response.value,
          questionName: response.name,
          child: null
        };
        // check if the answer is an image
        if (response.value && response.value.startsWith("https://s3.amazonaws.com")) {
          // download the image
          const image = await axios({
            url: response.value,
            responseType: "stream",
            responseEncoding: "utf-8"
          });
          // save it to the directory - directory name should be name of report/name of question
          const imagePath = `${record.attributes.reportName}/${response.name}/attachment.jpeg`;
          archive.append(image.data, { name: imagePath });
          answer.value = "image/jpeg";
          // create record in manifest.reportFiles
          bundle.manifest.reportFiles.push({
            reportName: newRecord.reportName,
            questionName: answer.questionName,
            size: image.headers["content-length"],
            path: imagePath,
            type: "image/jpeg"
          });
        }
        // check if the answer is a child
        // find an existing answer's question name inside this answer's question name
        const answerIndex = newRecord.answers.findIndex(existingAnswer => {
          let found = answer.questionName.search(existingAnswer.questionName);
          if (found === -1) return false;
          else return true;
        });
        if (answerIndex !== -1) newRecord.answers[answerIndex].child = answer;
        else newRecord.answers.push(answer);
      }
      bundle.reports.push(newRecord);
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

  static async createShape(payload, fields) {
    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);

    let shapeArray = {
      type: "FeatureCollection",
      features: []
    };

    // sanitise fields
    const filteredFields = allowedFields.filter(value => fields.includes(value));

    for await (const record of payload) {
      let shape = {
        type: "Feature",
        properties: {
          id: record.id
        }
      };
      filteredFields.forEach(field => {
        if (record.attributes[field]) shape.properties[field] = record.attributes[field];
      });
      if (record.attributes.clickedPosition && record.attributes.clickedPosition.length > 1) {
        let coordinates = [];
        record.attributes.clickedPosition.forEach(position => {
          coordinates.push([position.lat, position.lon]);
        });
        shape.geometry = {
          type: "MultiPoint",
          coordinates
        };
      } else if (record.attributes.clickedPosition && record.attributes.clickedPosition.length === 1) {
        shape.geometry = {
          type: "Point",
          coordinates: [record.attributes.clickedPosition[0].lat, record.attributes.clickedPosition[0].lon]
        };
      } else continue;
      shapeArray.features.push(shape);
    }
    //let shpfile = shpwrite.zip(shapeArray);

    let shpfile = await ConvertService.geojsonToShp(shapeArray);

    archive.append(shpfile, { name: `reports.zip` });
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

    let geojson = {
      type: "FeatureCollection",
      features: []
    };
    for await (const record of payload) {
      let shape = {
        type: "Feature",
        properties: {
          ...record.attributes
        }
      };
      if (record.attributes.clickedPosition && record.attributes.clickedPosition.length > 1) {
        let coordinates = [];
        record.attributes.clickedPosition.forEach(position => {
          coordinates.push([position.lat, position.lon]);
        });
        shape.geometry = {
          type: "MultiPoint",
          coordinates
        };
      } else {
        shape.geometry = {
          type: "Point",
          coordinates: [record.attributes.clickedPosition.lat, record.attributes.clickedPosition.lon]
        };
      }
      geojson.features.push(shape);
    }

    archive.append(JSON.stringify(geojson), { name: `reports.geojson` });
    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(contents);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }

  static async createPDF(payload, templates, fields, language) {
    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);
    let images = {};
    images.fullName = await axios.get("https://cdn-icons-png.flaticon.com/512/1077/1077114.png", {
      responseType: "arraybuffer"
    });
    images.areaOfInterestName = await axios.get("https://cdn-icons-png.flaticon.com/512/592/592245.png", {
      responseType: "arraybuffer"
    });
    images.createdAt = await axios.get("https://cdn-icons-png.flaticon.com/512/747/747310.png", {
      responseType: "arraybuffer"
    });
    images.layer = await axios.get("https://cdn-icons-png.flaticon.com/512/126/126307.png", {
      responseType: "arraybuffer"
    });
    images.clickedPosition = await axios.get("https://cdn-icons-png.flaticon.com/512/70/70699.png", {
      responseType: "arraybuffer"
    });
    images.userPosition = images.clickedPosition;

    // create array of questions. There will be lots of questions depending on the number of templates.
    let questions = [];
    templates.forEach(template => {
      questions.push(...template.attributes.questions);
    });

    // sanitise fields
    const filteredFields = allowedFields.filter(value => fields.includes(value));

    console.log(filteredFields);
    console.log(payload);

    for await (const record of payload) {
      var docStreamBuffer = new streamBuffers.WritableStreamBuffer({
        initialSize: 100 * 1024, // start at 100 kilobytes.
        incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
      });

      const doc = new PDFDocument({ size: "A4" });
      doc.pipe(docStreamBuffer);

      doc.fontSize(15).text("Monitoring Report", 50, 80);
      doc.font("Helvetica-Bold").fontSize(15).text(record.attributes.reportName.toUpperCase(), 50, 105);

      filteredFields.forEach((field, i) => {
        doc.image(images[field].data, 50 + 250 * (i % 2), 150 + ((i - (i % 2)) / 2) * 50, { fit: [20, 20] });
        let fieldName = "";
        if (titles[language][field]) fieldName = titles[language][field];
        else fieldName = field;
        doc
          .font("Helvetica")
          .fontSize(12)
          .text(fieldName.toUpperCase(), 80 + 250 * (i % 2), 150 + ((i - (i % 2)) / 2) * 50);
        let textToPrint = "";
        if (Array.isArray(record.attributes[field])) {
          // if it's coordinates
          if (typeof record.attributes[field][0] === "object") {
            // if it's an array of objects ({lon: number, lat: number})
            if (record.attributes[field].length > 1) {
              textToPrint = "MULTIPOINT (";
              record.attributes[field].forEach(point => {
                textToPrint = textToPrint + `(${point.lon} ${point.lat}), `;
              });
              textToPrint.slice(0, -1);
              textToPrint.slice(0, -1);
              textToPrint = textToPrint + ")";
            } else {
              textToPrint = `POINT (${record.attributes[field][0].lon} ${record.attributes[field][0].lat})`;
            }
          } else {
            // if it's an array of coordinates
            textToPrint = `POINT (${record.attributes[field][0]} ${record.attributes[field][1]})`;
          }
        } else textToPrint = record.attributes[field];
        doc.fontSize(15).text(textToPrint, 80 + 250 * (i % 2), 170 + ((i - (i % 2)) / 2) * 50);
      });

      const lineY = 50 + 50 * (filteredFields.length + (filteredFields.length % 2) / 2);

      doc.moveTo(50, lineY).lineTo(500, lineY).stroke();

      // loop over responses
      record.attributes.responses.forEach((response, i) => {
        let responseToShow = "";
        // find the question in questions, if not found, add
        let question = questions.find(question => question.name === response.name);
        if (!question) {
          question = { name: response.name, label: { [language]: response.name } };
          questions.push(question);
        }
        // check if the answer is an image
        if (response.value && response.value.startsWith("https://s3.amazonaws.com")) {
          responseToShow = `Picture found at: ${response.value}`;
        } else responseToShow = response.value;

        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(question.label[language], 50, lineY + 15 + 50 * i);
        doc
          .font("Helvetica")
          .fontSize(12)
          .text(responseToShow, 50, lineY + 30 + 50 * i);
      });

      doc.end();

      await new Promise(resolve => {
        docStreamBuffer.on("finish", () => {
          const docContents = docStreamBuffer.getContents();
          archive.append(docContents, { name: `${record.id.toString()}.pdf` });
          resolve();
        });
      });
    }

    //archive.append(shpfile, { name: `reports.zip` });
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

const titles = {
  en: {
    fullName: "Name",
    areaOfInterestName: "Area",
    createdAt: "Date",
    language: "Language",
    userPosition: "User Position",
    reportedPosition: "Reported Position",
    layer: "Alert"
  },

  es: {
    fullName: "Nombre",
    areaOfInterestName: "Area",
    createdAt: "Fecha",
    language: "Idioma",
    userPosition: "Posición del usuario",
    reportedPosition: "Posición del reporte",
    layer: "Alerta"
  },

  fr: {
    fullName: "Nom",
    areaOfInterestName: "Zone",
    createdAt: "Date",
    language: "Langue",
    userPosition: "Position de l'utilisateur",
    reportedPosition: "Position signalée",
    layer: "Alerte"
  },

  id: {
    fullName: "Nama",
    areaOfInterestName: "Area",
    createdAt: "Tanggal",
    language: "Bahasa",
    userPosition: "Posisi Pengguna",
    reportedPosition: "Posisi Terlapor",
    layer: "Peringatan"
  },

  mg: {
    fullName: "Nama",
    areaOfInterestName: "Area",
    createdAt: "Tanggal",
    language: "Bahasa",
    userPosition: "Posisi Pengguna",
    reportedPosition: "Posisi Terlapor",
    layer: "Peringatan"
  },

  nl: {
    fullName: "Naam",
    areaOfInterestName: "gebied",
    createdAt: "Datum",
    language: "Taal",
    userPosition: "Gebruikers locatie",
    reportedPosition: "Gerapporteerde locatie",
    layer: "Waarschuwing"
  },

  pt: {
    fullName: "Nome",
    areaOfInterestName: "Área",
    createdAt: "Data",
    language: "Língua",
    userPosition: "Posição do usuário",
    reportedPosition: "Localização reportada",
    layer: "Alerta"
  }
};
