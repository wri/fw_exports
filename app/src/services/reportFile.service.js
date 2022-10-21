const { parse } = require("json2csv");
const archiver = require("archiver");
import axios from "axios";
const streamBuffers = require("stream-buffers");
//const shpwrite = require("shp-write");
const PDFDocument = require("pdfkit");
const ConvertService = require("./convert.service");
//const GeostoreService = require("./geostore.service");
import logger from "../logger";

const allowedFields = [
  "reportName",
  "report",
  "templateName",
  "fullName",
  "teamId",
  "areaOfInterest",
  "areaOfInterestName",
  "language",
  "userPosition",
  "user",
  "createdAt",
  "clickedPosition",
  "reponses",
  "layer"
];

class FileService {
  static async createCsv(payload, fields, templates, defaultLanguage) {
    // fields is an array of accepted fields
    // payload is an array of objects

    logger.info(`Exporting ${payload.length} reports`);

    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 100 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);

    // create object questions with keys of template ids and values of question arrays. There will be lots of questions depending on the number of templates.
    let questions = {};
    templates.forEach(template => {
      if (!questions[template.id]) questions[template.id] = [];
      template.attributes.questions.forEach(question => {
        questions[template.id].push({
          ...question,
          defaultLanguage: template.attributes.defaultLanguage
        });
        if (question.childQuestions && question.childQuestions.length > 0)
          questions[template.id].push(
            ...question.childQuestions.map(cQuestion => {
              return {
                ...cQuestion,
                defaultLanguage: template.attributes.defaultLanguage
              };
            })
          );
      });
    });

    // flatten object
    for await (const record of payload) {
      // check if language is supported
      let language = "";
      const template = templates.find(temp => temp.id === record.attributes.report);
      if (template.attributes.languages.includes(defaultLanguage)) language = defaultLanguage;
      else language = template.attributes.defaultLanguage;

      logger.info(`Exporting ${record.attributes.reportName}`);
      for (const property in record.attributes) {
        let textToPrint = "";
        if (Array.isArray(record.attributes[property]) && property !== "responses") {
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

      // loop over responses
      for await (const response of record.responses) {
        // find the question in questions, if not found, add
        let question = questions[record.attributes.report].find(question => question.name === response.name);
        if (!question) {
          question = { name: response.name, label: { [language]: response.name } };
          questions[record.attributes.report].push(question);
        }
        // check if the answer is a file
        if (response.value && response.value.startsWith("https://s3.amazonaws.com")) {
          if (payload.length < 20) {
            // download the file
            const file = await axios({
              url: response.value,
              responseType: "stream",
              responseEncoding: "utf-8"
            });
            const splitString = response.value.split(".");
            const [extension] = splitString.slice(-1);
            // save it to the directory - directory name should be name of report/name of question
            const filePath = `${record.attributes.reportName}/${response.name}/attachment.${extension}`;
            archive.append(file.data, { name: filePath });
            // add the path to the csv file
            record[question.label[language]] = filePath;
          } else record[question.label[language]] = response.value;
        } else record[question.label[language]] = response.value;
      }
    }

    templates.forEach(template => {
      const templateFields = [...fields];
      templateFields.push(
        ...questions[template.id].map(
          question => question.label[defaultLanguage] || question.label[question.defaultLanguage]
        )
      );

      const columnLabels = templateFields.map(field => {
        if (titles[defaultLanguage][field]) return { label: titles[defaultLanguage][field], value: field };
        else if (titles.en[field]) return { label: titles.en[field], value: field };
        else return field;
      });

      const templatePayload = payload.filter(answer => answer.attributes.report.toString() === template.id.toString());

      const opts = { fields: columnLabels };
      const csv = parse(templatePayload, opts);
      archive.append(csv, { name: `${template.id}answers.csv` });
    });
    archive.finalize();

    logger.info("CSV finalised");

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        logger.info("Finished buffering");
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
        // check if the answer is a file
        if (response.value && response.value.startsWith("https://s3.amazonaws.com")) {
          if (payload.length < 20) {
            // download the file
            const file = await axios({
              url: response.value,
              responseType: "stream",
              responseEncoding: "utf-8"
            });
            const fileName = response.value;
            const [fileExtension] = fileName.split(".").slice(-1);
            // save it to the directory - directory name should be name of report/name of question
            const filePath = `${record.attributes.reportName}/${response.name}/attachment.${extension}`;
            archive.append(file.data, { name: filePath });
            answer.value = extension === "jpeg" ? "image/jpeg" : `audio/${extension}`;
            // create record in manifest.reportFiles
            bundle.manifest.reportFiles.push({
              reportName: newRecord.reportName,
              questionName: answer.questionName,
              size: file.headers["content-length"],
              path: filePath,
              type: answer.value
            });
          }
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
          coordinates.push([position.lon, position.lat]);
        });
        shape.geometry = {
          type: "MultiPoint",
          coordinates
        };
      } else if (record.attributes.clickedPosition && record.attributes.clickedPosition.length === 1) {
        shape.geometry = {
          type: "MultiPoint",
          coordinates: [[record.attributes.clickedPosition[0].lon, record.attributes.clickedPosition[0].lat]]
        };
      } else continue;
      shapeArray.features.push(shape);
    }

    //let originalshpfile = shpwrite.zip(shapeArray);

    let newshpfile = await ConvertService.geojsonToShp(shapeArray);

    //archive.append(originalshpfile, { name: `reports.zip` });
    archive.append(newshpfile, { name: "reports.zip" });
    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        const contents = myWritableStreamBuffer.getContents();
        resolve(newshpfile);
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
          coordinates.push([position.lon, position.lat]);
        });
        shape.geometry = {
          type: "MultiPoint",
          coordinates
        };
      } else {
        shape.geometry = {
          type: "Point",
          coordinates: [record.attributes.clickedPosition.lon, record.attributes.clickedPosition.lat]
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
    images.layer = await axios.get("https://cdn-icons-png.flaticon.com/512/497/497789.png", {
      responseType: "arraybuffer"
    });
    images.clickedPosition = await axios.get("https://cdn-icons-png.flaticon.com/512/70/70699.png", {
      responseType: "arraybuffer"
    });
    images.areaOfInterest = await axios.get("https://cdn-icons-png.flaticon.com/512/3381/3381635.png", {
      responseType: "arraybuffer"
    });
    images.language = await axios.get("https://cdn-icons-png.flaticon.com/512/484/484633.png", {
      responseType: "arraybuffer"
    });
    images.templateName = await axios.get("https://cdn-icons-png.flaticon.com/512/2991/2991112.png", {
      responseType: "arraybuffer"
    });
    images.report = images.areaOfInterest;
    images.user = images.areaOfInterest;
    images.teamId = images.user;
    images.startDate = images.createdAt;
    images.endDate = images.startDate;
    images.userPosition = images.clickedPosition;

    // sanitise fields
    const filteredFields = allowedFields.filter(value => {
      return fields.includes(value) && value !== "clickedPosition" && value !== "reportName";
    });

    for await (const record of payload) {
      let questions = [];
      let template = templates.find(temp => temp.id === record.attributes.report);
      template.attributes.questions.forEach(question => {
        questions.push({
          ...question,
          defaultLanguage: template.attributes.defaultLanguage
        });
        if (question.childQuestions && question.childQuestions.length > 0)
          questions.push(
            ...question.childQuestions.map(cQuestion => {
              return { ...cQuestion, defaultLanguage: template.attributes.defaultLanguage };
            })
          );
      });

      var docStreamBuffer = new streamBuffers.WritableStreamBuffer({
        initialSize: 100 * 1024, // start at 100 kilobytes.
        incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
      });
      const doc = new PDFDocument({ size: "A4" });
      doc.pipe(docStreamBuffer);

      doc.fontSize(14).text("Monitoring Report", 50, 80);
      doc.font("Helvetica-Bold").fontSize(14).text(record.attributes.reportName.toUpperCase(), 50, 105);

      filteredFields.forEach((field, i) => {
        doc.image(images[field].data, 50 + 250 * (i % 2), 150 + ((i - (i % 2)) / 2) * 50, { fit: [20, 20] });
        let fieldName = "";
        if (titles[language][field]) fieldName = titles[language][field];
        else if (titles.en[field]) fieldName = titles.en[field];
        else fieldName = field;
        doc
          .font("Helvetica")
          .fontSize(11)
          .text(fieldName.toUpperCase(), 80 + 250 * (i % 2), 150 + ((i - (i % 2)) / 2) * 50);
        let textToPrint = "";
        if (Array.isArray(record.attributes[field])) {
          // if it's coordinates
          if (typeof record.attributes[field][0] === "object") {
            // if it's an array of objects ({lon: number, lat: number})
            if (record.attributes[field].length > 1) {
              textToPrint = "MULTIPOINT (";
              record.attributes[field].forEach(point => {
                textToPrint =
                  textToPrint + `(${point.lon.toString().substring(0, 9)} ${point.lat.toString().substring(0, 9)}), `;
              });
              textToPrint.slice(0, -1);
              textToPrint.slice(0, -1);
              textToPrint = textToPrint + ")";
            } else {
              textToPrint = `POINT (${record.attributes[field][0].lon.toString().substring(0, 9)} ${record.attributes[
                field
              ][0].lat
                .toString()
                .substring(0, 9)})`;
            }
          } else {
            // if it's an array of coordinates
            textToPrint = `POINT (${record.attributes[field][0].toString().substring(0, 9)} ${record.attributes[
              field
            ][1]
              .toString()
              .substring(0, 9)})`;
          }
        } else textToPrint = record.attributes[field];
        doc.fontSize(13).text(textToPrint, 80 + 250 * (i % 2), 170 + ((i - (i % 2)) / 2) * 50);
      });
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
      doc.moveDown(1);
      // loop over responses
      record.attributes.responses.forEach((response, i) => {
        let responseToShow = "";
        // find the question in questions, if not found, add
        let question = questions.find(question => question.name === response.name);
        if (!question) {
          question = { name: response.name, label: { [language]: response.name } };
          questions.push(question);
        }
        // check if the answer is a file
        if (response.value && response.value.startsWith("https://s3.amazonaws.com")) {
          responseToShow = `File found at: ${response.value}`;
        } else responseToShow = response.value;

        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(question.label[language] || question.label[question.defaultLanguage], 50); //, lineY + 15 + 50 * i);
        doc.moveDown(0.5);
        doc.font("Helvetica").fontSize(11).text(responseToShow, 50); //, lineY + 30 + 50 * i);
        doc.moveDown(1);
      });

      if (fields.includes("clickedPosition")) {
        //doc.image(images.clickedPosition.data, 50, doc.y, { fit: [20, 20] }); //, 270 + 50 * record.attributes.responses.length, { fit: [20, 20] });
        let fieldName = "";
        if (titles[language].clickedPosition) fieldName = titles[language].clickedPosition;
        else fieldName = "Clicked Position";
        doc.font("Helvetica").fontSize(11).text(fieldName.toUpperCase(), 50, doc.y); //, 270 + 50 * record.attributes.responses.length);
        let textToPrint = "";
        if (Array.isArray(record.attributes.clickedPosition)) {
          // if it's coordinates
          if (typeof record.attributes.clickedPosition[0] === "object") {
            // if it's an array of objects ({lon: number, lat: number})
            if (record.attributes.clickedPosition.length > 1) {
              textToPrint = "MULTIPOINT (";
              record.attributes.clickedPosition.forEach(point => {
                textToPrint = textToPrint + `(${point.lon} ${point.lat}), `;
              });
              textToPrint.slice(0, -1);
              textToPrint.slice(0, -1);
              textToPrint = textToPrint + ")";
            } else {
              textToPrint = `POINT (${record.attributes.clickedPosition[0].lon} ${record.attributes.clickedPosition[0].lat})`;
            }
          } else {
            // if it's an array of coordinates
            textToPrint = `POINT (${record.attributes.clickedPosition[0]} ${record.attributes.clickedPosition[1]})`;
          }
        } else textToPrint = record.attributes.clickedPosition;
        doc.moveDown(0.5);
        doc.fontSize(14).text(textToPrint, 50, doc.y); //, 290 + 50 * record.attributes.responses.length);
      }

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
    layer: "Alert",
    reportName: "Report Name",
    report: "Template ID",
    templateName: "Template Name",
    teamId: "Team ID",
    areaOfInterest: "Area ID",
    startDate: "Start Date",
    endDate: "End Date",
    user: "Monitor ID",
    clickedPosition: "Reported Position"
  },

  es: {
    fullName: "Nombre",
    areaOfInterestName: "Area",
    createdAt: "Fecha",
    language: "Idioma",
    userPosition: "Posición del usuario",
    reportedPosition: "Posición del reporte",
    clickedPosition: "Posición del reporte",
    layer: "Alerta"
  },

  fr: {
    fullName: "Nom",
    areaOfInterestName: "Zone",
    createdAt: "Date",
    language: "Langue",
    userPosition: "Position de l'utilisateur",
    reportedPosition: "Position signalée",
    clickedPosition: "Position signalée",
    layer: "Alerte"
  },

  id: {
    fullName: "Nama",
    areaOfInterestName: "Area",
    createdAt: "Tanggal",
    language: "Bahasa",
    userPosition: "Posisi Pengguna",
    reportedPosition: "Posisi Terlapor",
    clickedPosition: "Posisi Terlapor",
    layer: "Peringatan"
  },

  mg: {
    fullName: "Nama",
    areaOfInterestName: "Area",
    createdAt: "Tanggal",
    language: "Bahasa",
    userPosition: "Posisi Pengguna",
    reportedPosition: "Posisi Terlapor",
    clickedPosition: "Posisi Terlapor",
    layer: "Peringatan"
  },

  nl: {
    fullName: "Naam",
    areaOfInterestName: "gebied",
    createdAt: "Datum",
    language: "Taal",
    userPosition: "Gebruikers locatie",
    reportedPosition: "Gerapporteerde locatie",
    clickedPosition: "Gerapporteerde locatie",
    layer: "Waarschuwing"
  },

  pt: {
    fullName: "Nome",
    areaOfInterestName: "Área",
    createdAt: "Data",
    language: "Língua",
    userPosition: "Posição do usuário",
    reportedPosition: "Localização reportada",
    clickedPosition: "Localização reportada",
    layer: "Alerta"
  }
};
