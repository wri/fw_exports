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

class ReportFileService {
  static async createCsv(answers, fields, templates, defaultLanguage) {
    // fields is an array of accepted fields
    // payload is an array of objects

    logger.info(`Exporting ${answers.length} reports`);

    var writeStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 100 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");
    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(writeStreamBuffer);

    // create object questions with keys of template ids and values of question arrays. There will be lots of questions depending on the number of templates.
    let questions = getQuestions(templates);

    const stringifyCoords = coords => {
      if (coords.length === 0) return "";

      // Assumes all elements share the same type
      const isArrayCoords = Array.isArray(coords[0]);
      const pairStrings = coords.map(coord => (isArrayCoords ? coord.join(" ") : `${coord.lat} ${coord.lon}`));
      if (coords.length === 1) return `POINT (${pairStrings[0]})`;

      const pairBracketedStrings = pairStrings.map(p => `(${p})`);
      return `MULTIPOINT (${pairBracketedStrings.join(", ")})`;
    };

    const stringifyUserPosition = coords => {
      if (coords.length === 0) return "";
      return `POINT (${coords.join(", ")})`;
    };

    for await (const answer of answers) {
      Object.assign(answer, answer.attributes);
      answer.clickedPosition = stringifyCoords(answer.attributes.clickedPosition);
      answer.userPosition = stringifyUserPosition(answer.attributes.userPosition);

      const templateId = answer.attributes.report;
      const template = templates.find(t => t.id === templateId);
      const language = template.attributes.languages.includes(defaultLanguage)
        ? defaultLanguage
        : template.attributes.defaultLanguage;

      for await (const response of answer.responses) {
        let question = questions[templateId].find(question => question.name === response.name);
        if (!question) {
          question = { name: response.name, label: { [language]: response.name } };
          questions[templateId].push(question);
        }

        const isFileResponse = ["blob", "audio"].includes(question.type);
        if (!isFileResponse || answers.length > 20) {
          answer[question.label[language]] = response.value;
          continue;
        }

        const fileUrls = Array.isArray(response.value) ? response.value : [response.value];

        const fileDownloadPromises = fileUrls.map(url => {
          if (url)
            return axios({
              url: typeof url === "object" ? url.url : url,
              responseType: "stream",
              responseEncoding: "utf-8"
            });
          else return null;
        });
        const files = await Promise.all(fileDownloadPromises.filter(n => n));

        const filePaths = [];
        files.forEach((file, i) => {
          if (!file) return;
          const fileName = fileUrls[i];
          const [fileExtension] = fileName.split(".").slice(-1);
          const filePath = `${answer.attributes.reportName}/${response.name}/attachment-${i}.${fileExtension}`;

          archive.append(file.data, { name: filePath });
          filePaths.push(filePath);
        });

        answer[question.label[language]] = filePaths.join(", ");
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

      const templatePayload = answers.filter(answer => answer.attributes.report.toString() === template.id.toString());

      const opts = { fields: columnLabels };
      const csv = parse(templatePayload, opts);
      archive.append(csv, { name: `${template.id}answers.csv` });
    });
    archive.finalize();

    logger.info("CSV finalised");

    return new Promise((resolve, reject) => {
      writeStreamBuffer.on("finish", () => {
        logger.info("Finished buffering");
        const contents = writeStreamBuffer.getContents();
        resolve(contents);
      });
      writeStreamBuffer.on("error", reject);
    });
  }

  static async createBundle(answers, templates) {
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
    const writeStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");
    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(writeStreamBuffer);

    // set templates
    templates.forEach(template => {
      bundle.templates[template.id] = template;
    });

    let questions = getQuestions(templates);

    // loop over records
    for await (const answer of answers) {
      let newRecord = {
        id: answer.id,
        area: {
          id: answer.attributes.areaOfInterest,
          name: answer.attributes.areaOfInterestName
        },
        reportName: answer.attributes.reportName,
        userPosition: answer.attributes.userPosition.toString(),
        clickedPosition: JSON.stringify(answer.attributes.clickedPosition),
        date: answer.attributes.createdAt,
        answers: []
      };
      //const template = templates.find(t => answer.attributes.report.toString() === t.id.toString());

      // loop over answers
      for await (const response of answer.attributes.responses) {
        let question = questions[answer.attributes.report].find(question => question.name === response.name);
        let exportAnswer = {
          value: response.value,
          questionName: response.name,
          child: null
        };
        if (["blob", "audio"].includes(question.type) && answers.length < 20) {
          const fileUrls = Array.isArray(response.value) ? response.value : [response.value];

          const fileDownloadPromises = fileUrls.map(url => {
            if (url)
              return axios({
                url: typeof url === "object" ? url.url : url,
                responseType: "stream",
                responseEncoding: "utf-8"
              });
            else return null;
          });
          const files = await Promise.all(fileDownloadPromises.filter(n => n));

          const filePaths = [];
          files.forEach((file, i) => {
            const fileName = fileUrls[i];
            const [fileExtension] = fileName.split(".").slice(-1);
            const filePath = `${answer.attributes.reportName}/${response.name}/attachment-${i}.${fileExtension}`;

            archive.append(file.data, { name: filePath });

            filePaths.push(filePath);
            bundle.manifest.reportFiles.push({
              reportName: newRecord.reportName,
              questionName: exportAnswer.questionName,
              size: file.headers["content-length"],
              path: filePath,
              type: `${question.type}/${fileExtension}`
            });
          });
          exportAnswer.value = question.type === "blob" ? filePaths : filePaths[0];
        } else exportAnswer.value = response.value;

        // check if the answer is a child
        // find an existing answer's question name inside this answer's question name
        const answerIndex = newRecord.answers.findIndex(existingAnswer => {
          let found = exportAnswer.questionName.search(existingAnswer.questionName);
          if (found === -1) return false;
          else return true;
        });
        if (answerIndex !== -1) newRecord.answers[answerIndex].child = exportAnswer;
        else newRecord.answers.push(exportAnswer);
      }
      bundle.reports.push(newRecord);
    }
    archive.append(JSON.stringify(bundle), { name: "bundle.json" });
    archive.finalize();

    return new Promise((resolve, reject) => {
      writeStreamBuffer.on("finish", () => {
        const contents = writeStreamBuffer.getContents();
        resolve(contents);
      });
      writeStreamBuffer.on("error", reject);
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

    //let questions = getQuestions(templates);

    let shapeArray = {
      type: "FeatureCollection",
      features: []
    };

    for await (const record of payload) {
      //const language = record.attributes.language;
      let shape = {
        type: "Feature",
        properties: {
          id: record.id
        }
      };

      const filteredFields = fields.filter(field => allowedFields.includes(field));
      // human readable keys
      Object.keys(record.attributes).forEach(key => {
        if (key !== "responses" && filteredFields.includes(key)) shape.properties[key] = record.attributes[key];
      });

      // human readable questions
      record.attributes.responses.forEach(response => {
        shape.properties[response.name] = response.value;
      });
      delete shape.properties.responses;

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
      } else {
        shape.geometry = {
          type: "MultiPoint",
          coordinates: [[0, 0]]
        };
      }
      shapeArray.features.push(shape);
    }

    //let originalshpfile = shpwrite.zip(shapeArray);

    let newshpfile = await ConvertService.geojsonToShp(shapeArray);

    //archive.append(originalshpfile, { name: `reports.zip` });
    archive.append(newshpfile, { name: "reports.zip" });
    archive.finalize();

    return new Promise((resolve, reject) => {
      myWritableStreamBuffer.on("finish", () => {
        resolve(newshpfile);
      });
      myWritableStreamBuffer.on("error", reject);
    });
  }

  static async createGeojson(payload, templates) {
    var myWritableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 100 * 1024, // start at 100 kilobytes.
      incrementAmount: 10 * 1024 // grow by 10 kilobytes each time buffer overflows.
    });

    const archive = archiver("zip");

    archive.on("error", function (err) {
      throw err;
    });
    archive.pipe(myWritableStreamBuffer);

    let questions = getQuestions(templates);

    let geojson = {
      type: "FeatureCollection",
      features: []
    };
    for await (const record of payload) {
      const language = record.attributes.language;

      let shape = {
        type: "Feature",
        properties: {}
      };

      // human readable keys
      Object.keys(record.attributes).forEach(key => {
        if (key !== "responses") {
          if (titles[language][key]) shape.properties[titles[language][key]] = record.attributes[key];
          else shape.properties[key] = record.attributes[key];
        }
      });

      // human readable questions
      record.attributes.responses.forEach(response => {
        let question = questions[record.attributes.report].find(question => question.name === response.name);
        if (question && question.label[language]) shape.properties[question.label[language]] = response.value;
        else shape.properties[response.name] = response.value;
      });
      delete shape.properties.responses;
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
          type: "Point",
          coordinates: [record.attributes.clickedPosition[0].lon, record.attributes.clickedPosition[0].lat]
        };
      } else {
        shape.geometry = {
          type: "Point",
          coordinates: [0, 0]
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

      doc.registerFont("Regular", "./app/src/services/font/NotoSansCJKjp-Regular.otf");
      doc.registerFont("Bold", "./app/src/services/font/NotoSansCJKjp-Bold.otf");

      doc.fontSize(14).text("Monitoring Report", 50, 80);
      doc.font("Bold").fontSize(14).text(record.attributes.reportName.toUpperCase(), 50, 105);

      filteredFields.forEach((field, i) => {
        if (images?.[field]?.data)
          doc.image(images[field].data, 50 + 250 * (i % 2), 150 + ((i - (i % 2)) / 2) * 50, { fit: [20, 20] });
        let fieldName = "";
        if (titles[language][field]) fieldName = titles[language][field];
        else if (titles.en[field]) fieldName = titles.en[field];
        else fieldName = field;
        doc
          .font("Regular")
          .fontSize(11)
          .text(fieldName.toUpperCase(), 80 + 250 * (i % 2), 150 + ((i - (i % 2)) / 2) * 50);
        let textToPrint = "";
        const value = record.attributes?.[field];
        if (Array.isArray(value)) {
          // if it's coordinates
          if (typeof value[0] === "object") {
            // if it's an array of objects ({lon: number, lat: number})
            if (value.length > 1) {
              textToPrint = "MULTIPOINT (";
              record.attributes?.[field].forEach(point => {
                textToPrint =
                  textToPrint + `(${point.lon?.toString().substring(0, 9)} ${point.lat?.toString().substring(0, 9)}), `;
              });
              textToPrint.slice(0, -1);
              textToPrint.slice(0, -1);
              textToPrint = textToPrint + ")";
            } else {
              textToPrint = `POINT (${value[0].lon?.toString().substring(0, 9)} ${value[0].lat
                ?.toString()
                .substring(0, 9)})`;
            }
          } else {
            // if it's an array of coordinates
            textToPrint = `POINT (${value[0]?.toString().substring(0, 9)} ${value[1]?.toString().substring(0, 9)})`;
          }
        } else textToPrint = value;
        doc.fontSize(13).text(textToPrint, 80 + 250 * (i % 2), 170 + ((i - (i % 2)) / 2) * 50);
      });
      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
      doc.moveDown(1);
      // loop over responses
      record.attributes.responses?.forEach(response => {
        let responseToShow = "";
        // find the question in questions, if not found, add
        let question = questions.find(question => question.name === response.name);
        if (!question) {
          question = { name: response.name, label: { [language]: response.name } };
          questions.push(question);
        }
        let files = [];

        // check if the answer is a file
        if (["blob", "audio"].includes(question.type)) {
          files = Array.isArray(response.value) ? response.value : [response.value];
          responseToShow = `File(s) found at: \n${files
            .map(file => (typeof file === "object" ? file.url : file))
            .join("\n")}`;
        } else responseToShow = response.value;

        doc
          .font("Bold")
          .fontSize(11)
          .text(question.label[language] || question.label[question.defaultLanguage], 50, doc.y, { underline: false }); //, lineY + 15 + 50 * i);
        doc.moveDown(0.5);
        if (files.length > 0)
          files.forEach(file => {
            doc
              .font("Regular")
              .fontSize(11)
              .text(typeof file === "object" ? file.url : file, 50, doc.y, {
                link: typeof file === "object" ? file.url : file,
                underline: true
              }); //, lineY + 30 + 50 * i);
            doc.moveDown(1);
          });
        else {
          doc.font("Regular").fontSize(11).text(responseToShow, 50, doc.y, { underline: false }); //, lineY + 30 + 50 * i);
          doc.moveDown(1);
        }
      });

      if (fields.includes("clickedPosition")) {
        let fieldName = "";
        if (titles[language].clickedPosition) fieldName = titles[language].clickedPosition;
        else fieldName = "Clicked Position";
        doc.font("Regular").fontSize(11).text(fieldName.toUpperCase(), 50, doc.y); //, 270 + 50 * record.attributes.responses.length);
        let textToPrint = "";
        if (Array.isArray(record.attributes.clickedPosition)) {
          // if it's coordinates
          if (typeof record.attributes.clickedPosition[0] === "object") {
            // if it's an array of objects ({lon: number, lat: number})
            if (record.attributes.clickedPosition.length > 1) {
              textToPrint = "MULTIPOINT (";
              record.attributes.clickedPosition?.forEach(point => {
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

module.exports = ReportFileService;

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

const getQuestions = templates => {
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
  return questions;
};
